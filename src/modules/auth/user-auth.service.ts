import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { JwtPayload, sign, verify } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { ApiKeyRole } from './entities/api-key.entity';
import { UserAccount, UserPlan } from './entities/user-account.entity';
import { UserLoginSession } from './entities/user-login-session.entity';
import { SignInDto, SignUpDto, UpdateUserProfileDto } from './dto/user-auth.dto';
import { createLogger } from '../../common/services/logger.service';
import { AdminExtendTrialDto, AdminSetExtraQuotaDto, AdminUpdateUserDto } from './dto/admin-user.dto';
import { PlanCatalogService } from '../billing/plan-catalog.service';
import { NotificationService } from '../notification/notification.service';

const scrypt = promisify(scryptCallback);

@Injectable()
export class UserAuthService implements OnModuleInit {
  private readonly logger = createLogger('UserAuthService');

  constructor(
    @InjectRepository(UserAccount, 'data') private readonly users: Repository<UserAccount>,
    @InjectRepository(UserLoginSession, 'data') private readonly sessions: Repository<UserLoginSession>,
    private readonly plans: PlanCatalogService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const existing = await this.users.findOneBy({ username });
    if (existing) {
      let changed = false;
      if (existing.role !== ApiKeyRole.ADMIN) {
        existing.role = ApiKeyRole.ADMIN;
        changed = true;
      }
      if (existing.plan !== null) {
        existing.plan = null;
        changed = true;
      }
      if (existing.status !== 'active') {
        existing.status = 'active';
        changed = true;
      }
      if (changed) {
        await this.users.save(existing);
      }
      return;
    }
    const password = process.env.ADMIN_PASSWORD || 'admin';
    await this.users.save(
      this.users.create({
        name: 'Administrator',
        email: process.env.ADMIN_EMAIL || 'admin@smartConfirm.local',
        username,
        passwordHash: await this.hashPassword(password),
        role: ApiKeyRole.ADMIN,
        plan: null,
        status: 'active',
        settings: {},
        usagePeriodStart: new Date(),
      }),
    );
    this.logger.warn('Default administrator created; change ADMIN_PASSWORD before production.');
  }

  async signUp(dto: SignUpDto) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim().toLowerCase();
    if (await this.users.findOne({ where: [{ email }, { username }] })) {
      throw new ConflictException('Email or username is already registered.');
    }
    const user = await this.users.save(
      this.users.create({
        name: dto.name.trim(),
        email,
        username,
        passwordHash: await this.hashPassword(dto.password),
        role: ApiKeyRole.OPERATOR,
        plan: UserPlan.FREE,
        status: 'active',
        settings: {},
        usagePeriodStart: new Date(),
      }),
    );
    void this.notifications
      ?.accountCreated(user)
      .catch(error =>
        this.logger.warn(
          `Unable to create account notification: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    return this.issueSession(user);
  }

  async signIn(dto: SignInDto) {
    const identifier = dto.identifier.trim().toLowerCase();
    const user = await this.users.findOne({ where: [{ email: identifier }, { username: identifier }] });
    if (!user || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username/email or password.');
    }
    if (user.status !== 'active') throw new UnauthorizedException('Account is not active.');
    return this.issueSession(user);
  }

  async validateToken(rawToken: string): Promise<UserAccount> {
    const claims = this.verifyJwt(rawToken);
    const login = await this.sessions.findOneBy({ tokenHash: this.hashToken(claims.jti!) });
    if (!login || login.expiresAt <= new Date()) throw new UnauthorizedException('Session expired or invalid.');
    if (login.userId !== claims.sub) throw new UnauthorizedException('Session expired or invalid.');
    const user = await this.users.findOneBy({ id: login.userId });
    if (!user || user.status !== 'active') throw new UnauthorizedException('Account is not active.');
    return user;
  }

  async logout(rawToken: string): Promise<void> {
    try {
      const claims = this.verifyJwt(rawToken, true);
      if (claims.jti) await this.sessions.delete({ tokenHash: this.hashToken(claims.jti) });
    } catch {
      // Logout is intentionally idempotent, including for an expired/invalid token.
    }
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<UserAccount> {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (dto.name) user.name = dto.name.trim();
    if (dto.settings) user.settings = { ...(user.settings ?? {}), ...dto.settings };
    return this.users.save(user);
  }

  publicView(user: UserAccount) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async adminList() {
    const users = await this.users.find({ order: { createdAt: 'DESC' } });
    return users.map(user => this.publicView(user));
  }

  async adminSummary() {
    const rows = await this.users
      .createQueryBuilder('user')
      .select('user.plan', 'plan')
      .addSelect('user.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.plan')
      .addGroupBy('user.status')
      .getRawMany<{ plan: UserPlan; status: string; count: string }>();
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const byPlan = rows
      .filter(row => row.plan)
      .reduce<Record<string, number>>((totals, row) => {
        totals[row.plan] = (totals[row.plan] ?? 0) + Number(row.count);
        return totals;
      }, {});
    return {
      total,
      active: rows.filter(row => row.status === 'active').reduce((sum, row) => sum + Number(row.count), 0),
      suspended: rows.filter(row => row.status === 'suspended').reduce((sum, row) => sum + Number(row.count), 0),
      free: rows.filter(row => row.plan === UserPlan.FREE).reduce((sum, row) => sum + Number(row.count), 0),
      pro: rows.filter(row => row.plan === UserPlan.PRO).reduce((sum, row) => sum + Number(row.count), 0),
      byPlan,
    };
  }

  async adminExtendTrial(id: string, dto: AdminExtendTrialDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === ApiKeyRole.ADMIN) throw new BadRequestException('Administrators do not have trials');

    const currentSettings = (user.settings as Record<string, any>) || {};
    let currentEnd: Date;
    if (currentSettings.trialEndsAt) {
      currentEnd = new Date(currentSettings.trialEndsAt);
    } else {
      const plan = this.plans.get(user.plan);
      const trialDays = plan.trialDays ?? 1;
      currentEnd = new Date(new Date(user.createdAt).getTime() + trialDays * 86_400_000);
    }

    let newEnd: Date;
    if (dto.trialEndsAt) {
      newEnd = new Date(dto.trialEndsAt);
      if (isNaN(newEnd.getTime())) {
        throw new BadRequestException('Invalid date provided for trialEndsAt');
      }
    } else {
      const now = new Date();
      const base = currentEnd > now ? new Date(currentEnd) : new Date(now);

      if (dto.extendYears) {
        base.setFullYear(base.getFullYear() + dto.extendYears);
      }
      if (dto.extendMonths) {
        base.setMonth(base.getMonth() + dto.extendMonths);
      }
      if (dto.extendWeeks) {
        base.setDate(base.getDate() + dto.extendWeeks * 7);
      }
      if (dto.extendDays) {
        base.setDate(base.getDate() + dto.extendDays);
      }
      if (dto.extendHours) {
        base.setTime(base.getTime() + dto.extendHours * 3600 * 1000);
      }

      if (!dto.extendYears && !dto.extendMonths && !dto.extendWeeks && !dto.extendDays && !dto.extendHours) {
        base.setDate(base.getDate() + 1);
      }
      newEnd = base;
    }

    user.settings = {
      ...currentSettings,
      trialEndsAt: newEnd.toISOString(),
    };

    if (dto.resetUsage) {
      user.sentMessages = 0;
      user.receivedMessages = 0;
      user.aiTokensUsed = 0;
      user.audioTranscriptionsUsed = 0;
      user.audioRepliesUsed = 0;
      user.usagePeriodStart = new Date();
    }

    const saved = await this.users.save(user);
    return {
      success: true,
      trialEndsAt: newEnd.toISOString(),
      user: this.publicView(saved),
    };
  }

  async adminSetExtraQuota(id: string, dto: AdminSetExtraQuotaDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    const currentSettings = (user.settings as Record<string, any>) || {};
    const currentQuota = currentSettings.extraQuota || {};

    const updatedQuota = {
      sessions: dto.sessions !== undefined ? dto.sessions : (currentQuota.sessions ?? 0),
      stores: dto.stores !== undefined ? dto.stores : (currentQuota.stores ?? 0),
      sentMessages: dto.sentMessages !== undefined ? dto.sentMessages : (currentQuota.sentMessages ?? 0),
      receivedMessages: dto.receivedMessages !== undefined ? dto.receivedMessages : (currentQuota.receivedMessages ?? 0),
      aiTokens: dto.aiTokens !== undefined ? dto.aiTokens : (currentQuota.aiTokens ?? 0),
    };

    user.settings = {
      ...currentSettings,
      extraQuota: updatedQuota,
    };

    const saved = await this.users.save(user);
    return {
      success: true,
      extraQuota: updatedQuota,
      user: this.publicView(saved),
    };
  }

  async adminUpdate(id: string, dto: AdminUpdateUserDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    if (user.username === 'admin' && dto.status === 'suspended') {
      throw new BadRequestException('The permanent administrator cannot be suspended');
    }
    if (dto.plan) {
      if (user.role === ApiKeyRole.ADMIN) throw new BadRequestException('Administrators do not have customer plans');
      this.plans.require(dto.plan);
      user.plan = dto.plan;
    }
    if (dto.status) {
      user.status = dto.status;
      if (dto.status === 'suspended') await this.sessions.delete({ userId: user.id });
    }
    if (dto.trial) {
      await this.adminExtendTrial(id, dto.trial);
    }
    if (dto.extraQuota) {
      await this.adminSetExtraQuota(id, dto.extraQuota);
    }
    const finalUser = (dto.trial || dto.extraQuota) ? (await this.users.findOneByOrFail({ id })) : await this.users.save(user);
    return this.publicView(finalUser);
  }

  private async issueSession(user: UserAccount) {
    const jti = randomBytes(24).toString('hex');
    const expiresInSeconds = this.jwtLifetimeSeconds();
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const accessToken = sign({ role: user.role, username: user.username }, this.jwtSecret(), {
      algorithm: 'HS256',
      subject: user.id,
      jwtid: jti,
      issuer: 'smartConfirm',
      audience: 'smartConfirm-dashboard',
      expiresIn: expiresInSeconds,
    });
    await this.sessions.save(this.sessions.create({ tokenHash: this.hashToken(jti), userId: user.id, expiresAt }));
    return { accessToken, token: accessToken, tokenType: 'Bearer', expiresAt, user: this.publicView(user) };
  }

  passwordMatches(user: UserAccount, password: string): Promise<boolean> {
    return this.verifyPassword(password, user.passwordHash);
  }

  private verifyJwt(rawToken: string, ignoreExpiration = false): JwtPayload {
    try {
      const payload = verify(rawToken, this.jwtSecret(), {
        algorithms: ['HS256'],
        issuer: 'smartConfirm',
        audience: 'smartConfirm-dashboard',
        ignoreExpiration,
      });
      if (typeof payload === 'string' || !payload.sub || !payload.jti) throw new Error('Missing JWT claims');
      return payload;
    } catch {
      throw new UnauthorizedException('Session expired or invalid.');
    }
  }

  private jwtSecret(): string {
    const configured = process.env.JWT_SECRET?.trim();
    if (configured) return configured;
    // Stable compatibility fallback for existing installations. Production deployments should set
    // a dedicated JWT_SECRET (at least 32 random bytes) so account tokens are independent of DB/API secrets.
    const seed = `${process.env.API_KEY_PEPPER || ''}:${process.env.DATABASE_PASSWORD || ''}:${process.env.ADMIN_PASSWORD || 'admin'}`;
    return createHash('sha256').update(`smartConfirm-jwt:${seed}`).digest('hex');
  }

  private jwtLifetimeSeconds(): number {
    const days = Number.parseInt(process.env.JWT_EXPIRES_DAYS || '30', 10);
    return (Number.isFinite(days) && days > 0 ? days : 30) * 24 * 60 * 60;
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [algorithm, saltHex, hashHex] = encoded.split(':');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = (await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
