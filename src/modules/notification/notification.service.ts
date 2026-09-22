import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { UserAccount } from '../auth/entities/user-account.entity';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { BillingSubscription } from '../billing/entities/subscription.entity';
import { Session } from '../session/entities/session.entity';
import { Notification, NotificationKind } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';

type NotificationInput = {
  eventType: string;
  title: string;
  message: string;
  kind?: NotificationKind;
  link?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  expiresAt?: Date | null;
};

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Notification, 'data') private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationRead, 'data') private readonly reads: Repository<NotificationRead>,
    @InjectRepository(UserAccount, 'data') private readonly users: Repository<UserAccount>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(BillingSubscription, 'data') private readonly subscriptions: Repository<BillingSubscription>,
  ) {}

  onModuleInit() {
    this.runExpiryScan();
    this.expiryTimer = setInterval(() => this.runExpiryScan(), 6 * 60 * 60 * 1000);
    this.expiryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  private runExpiryScan() {
    void this.notifyExpiringPlans().catch(error =>
      this.logger.warn(`Unable to scan expiring plans: ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  async listForUser(userId: string, limit = 30) {
    const now = new Date();
    const items = await this.notifications
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.active = :active', { active: true })
      .andWhere(
        new Brackets(q => q.where('notification.expiresAt IS NULL').orWhere('notification.expiresAt > :now', { now })),
      )
      .orderBy('notification.createdAt', 'DESC')
      .take(Math.min(Math.max(limit, 1), 100))
      .getMany();
    const readRows = items.length
      ? await this.reads.findBy({ userId, notificationId: In(items.map(item => item.id)) })
      : [];
    const readIds = new Set(readRows.map(row => row.notificationId));
    return {
      items: items.map(item => ({ ...item, read: readIds.has(item.id) })),
      unread: items.filter(item => !readIds.has(item.id)).length,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const visible = await this.notifications.findOneBy({ id: notificationId, userId, active: true });
    if (!visible || (visible.expiresAt && visible.expiresAt <= new Date()))
      throw new NotFoundException('Notification not found');
    if (!(await this.reads.existsBy({ notificationId, userId })))
      await this.reads.save(this.reads.create({ notificationId, userId }));
    return { read: true };
  }

  async markAllRead(userId: string) {
    const { items } = await this.listForUser(userId, 100);
    const existing = new Set((await this.reads.findBy({ userId })).map(row => row.notificationId));
    const rows = items
      .filter(item => !existing.has(item.id))
      .map(item => this.reads.create({ notificationId: item.id, userId }));
    if (rows.length) await this.reads.save(rows);
    return { marked: rows.length };
  }

  async createForUser(userId: string, input: NotificationInput): Promise<Notification> {
    if (input.dedupeKey) {
      const existing = await this.notifications.findOneBy({ dedupeKey: input.dedupeKey });
      if (existing) return existing;
    }
    const row = this.notifications.create({
      ...input,
      userId,
      kind: input.kind ?? NotificationKind.INFO,
      link: input.link ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      expiresAt: input.expiresAt ?? null,
      active: true,
    });
    try {
      return await this.notifications.save(row);
    } catch (error) {
      if (input.dedupeKey) {
        const existing = await this.notifications.findOneBy({ dedupeKey: input.dedupeKey });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async createForAdmins(input: NotificationInput) {
    const admins = await this.users.find({ where: { role: ApiKeyRole.ADMIN } });
    return Promise.all(
      admins.map(admin =>
        this.createForUser(admin.id, {
          ...input,
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:admin:${admin.id}` : null,
        }),
      ),
    );
  }

  async accountCreated(user: UserAccount) {
    await this.createForAdmins({
      eventType: 'user_registered',
      title: 'New customer account',
      message: `${user.name || user.email || user.username} created an account.`,
      kind: NotificationKind.INFO,
      link: '/admin/users',
      entityId: user.id,
      dedupeKey: `user-registered:${user.id}`,
    });
  }

  async sessionStatusChanged(sessionId: string, status: string) {
    if (!['ready', 'disconnected', 'failed', 'action_required'].includes(status)) return;
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (!session?.userId) return;
    const healthy = status === 'ready';
    const hour = new Date().toISOString().slice(0, 13);
    await this.createForUser(session.userId, {
      eventType: 'session_status_changed',
      title: healthy ? 'WhatsApp connected' : 'WhatsApp session needs attention',
      message: `${session.name || 'Your WhatsApp session'} is now ${status.replace('_', ' ')}.`,
      kind: healthy ? NotificationKind.SUCCESS : NotificationKind.WARNING,
      link: '/sessions',
      entityId: session.id,
      dedupeKey: `session:${session.id}:${status}:${hour}`,
    });
  }

  async subscriptionActivated(user: UserAccount, subscription: BillingSubscription) {
    const end = subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd.toLocaleDateString()
      : 'the next billing date';
    await this.createForUser(user.id, {
      eventType: 'subscription_activated',
      title: 'Subscription activated',
      message: `Your ${subscription.planSlug} plan is active until ${end}.`,
      kind: NotificationKind.SUCCESS,
      link: '/account',
      entityId: subscription.id,
      dedupeKey: `subscription-active:${subscription.id}:${subscription.planSlug}:${subscription.currentPeriodEnd?.toISOString() ?? 'open'}`,
    });
    await this.createForAdmins({
      eventType: 'customer_subscribed',
      title: 'New subscription',
      message: `${user.name || user.email || user.username} subscribed to ${subscription.planSlug}.`,
      kind: NotificationKind.SUCCESS,
      link: '/admin/payments',
      entityId: subscription.id,
      dedupeKey: `customer-subscribed:${subscription.id}:${subscription.planSlug}:${subscription.currentPeriodEnd?.toISOString() ?? 'open'}`,
    });
  }

  async orderChanged(
    userId: string | null,
    orderId: string,
    orderNumber: string | null,
    event: string,
    storeName: string,
  ) {
    if (!userId) return;
    const titles: Record<string, string> = {
      created: 'New store order',
      paid: 'Order payment confirmed',
      partiallyFulfilled: 'Order partially fulfilled',
      shipped: 'Order shipped',
      delivered: 'Order delivered',
      cancelled: 'Order cancelled',
    };
    await this.createForUser(userId, {
      eventType: `order_${event}`,
      title: titles[event] ?? 'Order updated',
      message: `Order ${orderNumber || orderId} on ${storeName} is ${event.replace(/([A-Z])/g, ' $1').toLowerCase()}.`,
      kind:
        event === 'cancelled'
          ? NotificationKind.WARNING
          : event === 'delivered' || event === 'paid'
            ? NotificationKind.SUCCESS
            : NotificationKind.INFO,
      link: '/stores',
      entityId: orderId,
      dedupeKey: `order:${orderId}:${event}`,
    });
  }

  async notifyExpiringPlans(now = new Date()) {
    const warningEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const expiring = await this.subscriptions
      .createQueryBuilder('subscription')
      .where('LOWER(subscription.status) IN (:...statuses)', { statuses: ['active', 'trialing'] })
      .andWhere('subscription.currentPeriodEnd > :now', { now })
      .andWhere('subscription.currentPeriodEnd <= :warningEnd', { warningEnd })
      .getMany();
    await Promise.all(
      expiring.map(subscription =>
        this.createForUser(subscription.userId, {
          eventType: 'subscription_expiring',
          title: 'Plan renewal is approaching',
          message: `Your ${subscription.planSlug} plan ${subscription.cancelAtPeriodEnd ? 'ends' : 'renews'} on ${subscription.currentPeriodEnd!.toLocaleDateString()}.`,
          kind: NotificationKind.WARNING,
          link: '/account',
          entityId: subscription.id,
          dedupeKey: `subscription-expiring:${subscription.id}:${subscription.currentPeriodEnd!.toISOString()}`,
        }),
      ),
    );
  }
}
