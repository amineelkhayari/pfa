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

export interface PlanLimits {
  sessions: number;
  stores: number;
  sentMessages: number;
  receivedMessages: number;
}

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  [UserPlan.FREE]: { sessions: 2, stores: 2, sentMessages: 500, receivedMessages: 500 },
  [UserPlan.PRO]: { sessions: 5, stores: 5, sentMessages: 1250, receivedMessages: 1250 },
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
  ) {}

  async assertCanCreateSession(): Promise<void> {
    const user = await this.currentLimitedUser();
    if (!user) return;
    const count = await this.sessions.count({ where: { userId: user.id } });
    const plan = user.plan ?? UserPlan.FREE;
    if (count >= PLAN_LIMITS[plan].sessions) {
      throw new ForbiddenException(`${plan} plan allows at most ${PLAN_LIMITS[plan].sessions} WhatsApp sessions`);
    }
  }

  async assertCanCreateStore(): Promise<void> {
    const user = await this.currentLimitedUser();
    if (!user) return;
    const count = await this.stores.count({ where: { userId: user.id } });
    const plan = user.plan ?? UserPlan.FREE;
    if (count >= PLAN_LIMITS[plan].stores) {
      throw new ForbiddenException(`${plan} plan allows at most ${PLAN_LIMITS[plan].stores} stores`);
    }
  }

  async getUserUsage(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    await this.resetUsagePeriodIfNeeded(user);
    const [sessions, stores] = await Promise.all([
      this.sessions.count({ where: { userId } }),
      this.stores.count({ where: { userId } }),
    ]);
    return {
      plan: user.plan,
      limits: PLAN_LIMITS[user.plan ?? UserPlan.FREE],
      usage: { sessions, stores, sentMessages: user.sentMessages, receivedMessages: user.receivedMessages },
      periodStart: user.usagePeriodStart,
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
      limits: user.role === ApiKeyRole.ADMIN ? null : PLAN_LIMITS[user.plan ?? UserPlan.FREE],
      usage: { sessions, stores, products, orders, sentMessages: user.sentMessages, receivedMessages: user.receivedMessages },
      usagePeriodStart: user.usagePeriodStart,
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
    const result = await this.users
      .createQueryBuilder()
      .update(UserAccount)
      .set({ sentMessages: () => 'sentMessages + 1' })
      .where('id = :id', { id: user.id })
      .andWhere('sentMessages < :limit', { limit: PLAN_LIMITS[user.plan ?? UserPlan.FREE].sentMessages })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async releaseOutgoingMessage(sessionId: string): Promise<void> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return;
    await this.users
      .createQueryBuilder()
      .update(UserAccount)
      .set({ sentMessages: () => 'CASE WHEN sentMessages > 0 THEN sentMessages - 1 ELSE 0 END' })
      .where('id = :id', { id: user.id })
      .execute();
  }

  async isInboundAutomationAllowed(sessionId: string): Promise<boolean> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return true;
    await this.resetUsagePeriodIfNeeded(user);
    return user.receivedMessages < PLAN_LIMITS[user.plan ?? UserPlan.FREE].receivedMessages;
  }

  async recordIncomingMessage(sessionId: string): Promise<void> {
    const user = await this.userForSession(sessionId);
    if (!user || user.role === ApiKeyRole.ADMIN) return;
    await this.resetUsagePeriodIfNeeded(user);
    await this.users.increment({ id: user.id }, 'receivedMessages', 1);
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
    const start = new Date(user.usagePeriodStart);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next > new Date()) return user;
    user.sentMessages = 0;
    user.receivedMessages = 0;
    user.usagePeriodStart = new Date();
    return this.users.save(user);
  }
}
