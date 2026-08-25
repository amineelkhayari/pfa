import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Repository } from 'typeorm';
import { ApiKeyRole } from './entities/api-key.entity';
import { UserAccount, UserPlan } from './entities/user-account.entity';
import { UserLoginSession } from './entities/user-login-session.entity';
import { SignInDto, SignUpDto, UpdateUserProfileDto } from './dto/user-auth.dto';
import { createLogger } from '../../common/services/logger.service';
import { AdminUpdateUserDto } from './dto/admin-user.dto';

const scrypt = promisify(scryptCallback);

@Injectable()
export class UserAuthService implements OnModuleInit {
  private readonly logger = createLogger('UserAuthService');

  constructor(
    @InjectRepository(UserAccount, 'data') private readonly users: Repository<UserAccount>,
    @InjectRepository(UserLoginSession, 'data') private readonly sessions: Repository<UserLoginSession>,
  ) {}

  async onModuleInit(): Promise<void> {
    const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const existing = await this.users.findOneBy({ username });
    if (existing) {
      if (existing.role === ApiKeyRole.ADMIN && existing.plan !== null) {
        existing.plan = null;
        await this.users.save(existing);
      }
      return;
    }
    const password = process.env.ADMIN_PASSWORD || 'admin';
    await this.users.save(
      this.users.create({
        name: 'Administrator',
        email: process.env.ADMIN_EMAIL || 'admin@openwa.local',
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
    const login = await this.sessions.findOneBy({ tokenHash: this.hashToken(rawToken) });
    if (!login || login.expiresAt <= new Date()) throw new UnauthorizedException('Session expired or invalid.');
    const user = await this.users.findOneBy({ id: login.userId });
    if (!user || user.status !== 'active') throw new UnauthorizedException('Account is not active.');
    return user;
  }

  async logout(rawToken: string): Promise<void> {
    await this.sessions.delete({ tokenHash: this.hashToken(rawToken) });
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
    return {
      total,
      active: rows.filter(row => row.status === 'active').reduce((sum, row) => sum + Number(row.count), 0),
      suspended: rows.filter(row => row.status === 'suspended').reduce((sum, row) => sum + Number(row.count), 0),
      free: rows.filter(row => row.plan === UserPlan.FREE).reduce((sum, row) => sum + Number(row.count), 0),
      pro: rows.filter(row => row.plan === UserPlan.PRO).reduce((sum, row) => sum + Number(row.count), 0),
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
      user.plan = dto.plan;
    }
    if (dto.status) {
      user.status = dto.status;
      if (dto.status === 'suspended') await this.sessions.delete({ userId: user.id });
    }
    return this.publicView(await this.users.save(user));
  }

  private async issueSession(user: UserAccount) {
    const token = `owa_usr_${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.sessions.save(this.sessions.create({ tokenHash: this.hashToken(token), userId: user.id, expiresAt }));
    return { token, expiresAt, user: this.publicView(user) };
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
