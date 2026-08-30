import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRequestUserScope } from '../../common/services/request-context';
import { Session } from '../session/entities/session.entity';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../stores/entities/product.entity';
import { Order } from '../stores/entities/order.entity';
import { BillingSubscription } from '../billing/entities/subscription.entity';
import { ApiKeyRole } from './entities/api-key.entity';
import { UserAccount, UserPlan } from './entities/user-account.entity';
import { PlanCatalogService } from '../billing/plan-catalog.service';

export interface PlanLimits {
  sessions: number;
  stores: number;
  sentMessages: number;
  receivedMessages: number;
  aiTokens: number;
}

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  [UserPlan.FREE]: { sessions: 1, stores: 1, sentMessages: 20, receivedMessages: 20, aiTokens: 5000 },
  [UserPlan.PRO]: { sessions: 5, stores: 5, sentMessages: 1250, receivedMessages: 1250, aiTokens: 100000 },
};

@Injectable()
export class PlanUsageService {
  constructor(
    @InjectRepository(UserAccount, 'data') private readonly users: Repository<UserAccount>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(Store, 'data') private readonly stores: Repository<Store>,
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(BillingSubscription, 'data') private readonly subscriptions: Repository<BillingSubscription>,
    private readonly plans: PlanCatalogService,
  ) {}

  async assertCanCreateSession(): Promise<void> {
    const user = await this.currentLimitedUser();
    if (!user) return;
    const count = await this.sessions.count({ where: { userId: user.id } });
    this.assertTrialActive(user);
    const limits = this.limitsFor(user);
    if (count >= limits.sessions) {
      throw new ForbiddenException(`Your plan allows at most ${limits.sessions} WhatsApp session(s). Choose a higher plan to continue.`);
    }
  }

  async assertCanCreateStore(): Promise<void> {
    const user = await this.currentLimitedUser();
    if (!user) return;
    const count = await this.stores.count({ where: { userId: user.id } });
    this.assertTrialActive(user);
    const limits = this.limitsFor(user);
    if (count >= limits.stores) {
      throw new ForbiddenException(`Your plan allows at most ${limits.stores} store(s). Choose a higher plan to continue.`);
    }
  }

  async getUserUsage(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    await this.resetUsagePeriodIfNeeded(user);
    const [sessions, stores] = await Promise.all([
      this.sessions.count({ where: { userId } }),
      this.stores.count({ where: { userId } }),
    ]);
    const trialEndsAt = this.trialEndsAt(user);
    return {
      plan: user.plan,
      limits: this.limitsFor(user),
      usage: { sessions, stores, sentMessages: user.sentMessages, receivedMessages: user.receivedMessages, aiTokens: user.aiTokensUsed ?? 0 },
      periodStart: user.usagePeriodStart,
      trialEndsAt,
      trialExpired: Boolean(trialEndsAt && trialEndsAt <= new Date()),
      renewable: this.plans.get(user.plan).priceMonthly > 0,
    };
  }

  async getAdminResourceTotals() {
    const [sessions, stores, products, orders] = await Promise.all([
      this.sessions.count(), this.stores.count(), this.products.count(), this.orders.count(),
    ]);
    return { sessions, stores, products, orders };
  }

  async getAdminUserDetails(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    await this.resetUsagePeriodIfNeeded(user);
    const [sessions, stores, products, orders, subscriptions] = await Promise.all([
      this.sessions.count({ where: { userId } }),
      this.stores.count({ where: { userId } }),
      this.products.createQueryBuilder('product').innerJoin('product.store', 'store').where('store.userId = :userId', { userId }).getCount(),
      this.orders.createQueryBuilder('order').innerJoin('order.store', 'store').where('store.userId = :userId', { userId }).getCount(),
      this.subscriptions.find({ where: { userId }, order: { updatedAt: 'DESC' } }),
    ]);
    return {
      user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, plan: user.plan, status: user.status, settings: user.settings, createdAt: user.createdAt, updatedAt: user.updatedAt },
      limits: user.role === ApiKeyRole.ADMIN ? null : this.limitsFor(user),
      usage: { sessions, stores, products, orders, sentMessages: user.sentMessages, receivedMessages: user.receivedMessages, aiTokens: user.aiTokensUsed ?? 0 },
      usagePeriodStart: user.usagePeriodStart,
      trialEndsAt: this.trialEndsAt(user),
      subscriptions,
    };
  }

  async resolveSessionScope(apiKeySessions?: string[] | null): Promise<string[] | undefined> {
    if (apiKeySessions?.length) return apiKeySessions;
    const scope = getRequestUserScope();
    if (!scope.userId || scope.isAdmin) return undefined;
    const rows = await this.sessions.find({ select: { id: true }, where: { userId: scope.userId } });
    return rows.map(row => row.id);
  }

  async reserveOutgoingMessage(sessionId: string): Promise<boolean> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return true;
    await this.resetUsagePeriodIfNeeded(user);
    if (this.isTrialExpired(user)) return false;
    const limit = this.limitsFor(user).sentMessages;
    const result = await this.users
      .createQueryBuilder()
      .update(UserAccount)
      .set({ sentMessages: () => '"sentMessages" + 1' })
      .where('id = :id', { id: user.id })
      .andWhere('"sentMessages" < :limit', { limit })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async releaseOutgoingMessage(sessionId: string): Promise<void> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return;
    await this.users
      .createQueryBuilder()
      .update(UserAccount)
      .set({ sentMessages: () => 'CASE WHEN "sentMessages" > 0 THEN "sentMessages" - 1 ELSE 0 END' })
      .where('id = :id', { id: user.id })
      .execute();
  }

  async isInboundAutomationAllowed(sessionId: string): Promise<boolean> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return true;
    await this.resetUsagePeriodIfNeeded(user);
    return !this.isTrialExpired(user) && user.receivedMessages < this.limitsFor(user).receivedMessages;
  }

  async recordIncomingMessage(sessionId: string): Promise<void> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return;
    await this.resetUsagePeriodIfNeeded(user);
    const limit = this.limitsFor(user).receivedMessages;
    await this.users.createQueryBuilder().update(UserAccount).set({ receivedMessages: () => '"receivedMessages" + 1' }).where('id = :id', { id: user.id }).andWhere('"receivedMessages" < :limit', { limit }).execute();
  }

  async consumeAiContextTokens(sessionId: string | undefined, tokens: number): Promise<void> {
    const safeTokens = Math.max(1, Math.ceil(tokens));
    const user = sessionId ? await this.userForSession(sessionId) : await this.currentLimitedUser();
    if (!user || user.role === ApiKeyRole.ADMIN) return;
    await this.resetUsagePeriodIfNeeded(user); this.assertTrialActive(user);
    const limit = this.limitsFor(user).aiTokens;
    const result = await this.users.createQueryBuilder().update(UserAccount)
      .set({ aiTokensUsed: () => `"aiTokensUsed" + ${safeTokens}` })
      .where('id = :id', { id: user.id }).andWhere('"aiTokensUsed" + :tokens <= :limit', { tokens: safeTokens, limit }).execute();
    if (!(result.affected ?? 0)) throw new ForbiddenException('AI context token limit reached. Choose a higher plan to continue using AI.');
  }

  private async currentLimitedUser(): Promise<UserAccount | null> {
    const scope = getRequestUserScope();
    if (!scope.userId || scope.isAdmin) return null;
    const user = await this.users.findOne({ where: { id: scope.userId, status: 'active' } });
    if (!user) throw new ForbiddenException('User account is inactive');
    return this.resetUsagePeriodIfNeeded(user);
  }

  private async userForSession(sessionId: string): Promise<UserAccount | null> {
    const session = await this.sessions.findOne({ select: { userId: true }, where: { id: sessionId } });
    if (!session?.userId) return null;
    return this.users.findOne({ where: { id: session.userId, status: 'active' } });
  }

  private async resetUsagePeriodIfNeeded(user: UserAccount): Promise<UserAccount> {
    if (this.plans.get(user.plan).priceMonthly === 0) return user;
    const start = new Date(user.usagePeriodStart);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next > new Date()) return user;
    user.sentMessages = 0;
    user.receivedMessages = 0;
    user.aiTokensUsed = 0;
    user.usagePeriodStart = new Date();
    return this.users.save(user);
  }

  private limitsFor(user: UserAccount): PlanLimits {
    return this.plans.get(user.plan).limits;
  }
  private trialEndsAt(user: UserAccount): Date | null {
    const plan = this.plans.get(user.plan);
    if (!plan.trialDays) return null;
    return new Date(new Date(user.createdAt).getTime() + plan.trialDays * 86_400_000);
  }
  private isTrialExpired(user: UserAccount): boolean { const end = this.trialEndsAt(user); return Boolean(end && end <= new Date()); }
  private assertTrialActive(user: UserAccount): void {
    if (this.isTrialExpired(user)) throw new ForbiddenException('Your trial has expired and cannot be renewed. Choose a paid plan to continue.');
  }
}
