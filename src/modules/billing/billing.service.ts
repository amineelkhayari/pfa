import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Brackets, In, Repository } from 'typeorm';
import { UserAccount, UserPlan } from '../auth/entities/user-account.entity';
import { BillingProvider, BillingSubscription } from './entities/subscription.entity';
import { BillingConfigService } from './billing-config.service';
import { PaymentStatus, PaymentTransaction } from './entities/payment-transaction.entity';
import { PlanCatalogService } from './plan-catalog.service';

type Json = Record<string, any>;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    @InjectRepository(BillingSubscription, 'data') private readonly subscriptions: Repository<BillingSubscription>,
    @InjectRepository(PaymentTransaction, 'data') private readonly transactions: Repository<PaymentTransaction>,
    @InjectRepository(UserAccount, 'data') private readonly users: Repository<UserAccount>,
    private readonly config: BillingConfigService,
    private readonly plans: PlanCatalogService,
  ) {}

  status(userId: string) {
    return this.subscriptions.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  history(userId: string, query: PaymentHistoryQuery = {}) { return this.queryTransactions({ ...query, userId }); }

  async listSubscriptions(query: SubscriptionQuery = {}) {
    const qb = this.subscriptions.createQueryBuilder('subscription').orderBy('subscription.updatedAt', 'DESC');
    if (query.provider) qb.andWhere('subscription.provider = :provider', { provider: query.provider });
    if (query.status) qb.andWhere('LOWER(subscription.status) = :status', { status: query.status.toLowerCase() });
    if (query.userId) qb.andWhere('subscription.userId = :userId', { userId: query.userId });
    const rows = await qb.getMany();
    const users = await this.users.findBy({ id: In([...new Set(rows.map(row => row.userId))]) });
    const lookup = new Map(users.map(user => [user.id, { id: user.id, name: user.name, email: user.email, username: user.username, plan: user.plan }]));
    return rows.map(row => ({ ...row, user: lookup.get(row.userId) ?? null }));
  }

  async cancelSubscription(subscriptionId: string, userId?: string, immediate = false, reason = 'Requested by account owner') {
    const row = await this.subscriptionForAction(subscriptionId, userId);
    if (!row.providerSubscriptionId) throw new BadRequestException('Subscription is not connected to a payment provider');
    if (row.provider === BillingProvider.STRIPE) {
      const response = immediate
        ? await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(row.providerSubscriptionId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${this.config.required('stripeSecretKey', 'STRIPE_SECRET_KEY')}` } })
        : await this.stripeUpdateSubscription(row.providerSubscriptionId, { cancel_at_period_end: 'true', 'cancellation_details[comment]': reason.slice(0, 500) });
      const data = await this.json(response);
      if (!response.ok) throw new BadGatewayException(data.error?.message ?? 'Stripe cancellation failed');
      row.cancelAtPeriodEnd = !immediate;
      row.status = immediate ? 'cancelled' : String(data.status ?? row.status);
      if (data.current_period_end) row.currentPeriodEnd = new Date(Number(data.current_period_end) * 1000);
    } else {
      const token = await this.payPalToken();
      const response = await fetch(`${this.payPalBase()}/v1/billing/subscriptions/${encodeURIComponent(row.providerSubscriptionId)}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.slice(0, 128) }) });
      if (!response.ok && response.status !== 204) { const data = await this.json(response); throw new BadGatewayException(data.message ?? 'PayPal cancellation failed'); }
      row.status = 'cancelled'; row.cancelAtPeriodEnd = false; row.currentPeriodEnd = new Date();
    }
    await this.subscriptions.save(row); await this.refreshUserPlan(row.userId);
    return row;
  }

  async reactivateSubscription(subscriptionId: string, userId?: string) {
    const row = await this.subscriptionForAction(subscriptionId, userId);
    if (row.provider !== BillingProvider.STRIPE) throw new BadRequestException('A cancelled PayPal subscription cannot be reactivated; create a new subscription');
    if (!row.cancelAtPeriodEnd) throw new BadRequestException('This subscription is not scheduled for cancellation');
    const response = await this.stripeUpdateSubscription(String(row.providerSubscriptionId), { cancel_at_period_end: 'false' });
    const data = await this.json(response);
    if (!response.ok) throw new BadGatewayException(data.error?.message ?? 'Stripe reactivation failed');
    row.cancelAtPeriodEnd = false; row.status = String(data.status ?? 'active');
    await this.subscriptions.save(row); await this.refreshUserPlan(row.userId);
    return row;
  }

  async refundPayment(transactionId: string, amount?: number, reason = 'Requested by administrator') {
    const payment = await this.transactions.findOneBy({ id: transactionId });
    if (!payment || payment.status !== PaymentStatus.SUCCEEDED) throw new BadRequestException('Only a successful payment can be refunded');
    if (!payment.providerPaymentId) throw new BadRequestException('The provider payment identifier is missing');
    const prior = await this.transactions.find({ where: { parentTransactionId: payment.id, status: PaymentStatus.REFUNDED } });
    const remaining = payment.amount - prior.reduce((sum, row) => sum + row.amount, 0);
    const refundAmount = amount == null ? remaining : Math.round(amount);
    if (refundAmount <= 0 || refundAmount > remaining) throw new BadRequestException(`Refund amount must be between 1 and ${remaining} minor currency units`);
    let providerRefundId: string; let providerStatus = 'pending';
    if (payment.provider === BillingProvider.STRIPE) {
      const body = new URLSearchParams({ payment_intent: payment.providerPaymentId, amount: String(refundAmount), reason: 'requested_by_customer', 'metadata[reason]': reason.slice(0, 500) });
      const response = await fetch('https://api.stripe.com/v1/refunds', { method: 'POST', headers: { Authorization: `Bearer ${this.config.required('stripeSecretKey', 'STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const data = await this.json(response); if (!response.ok || !data.id) throw new BadGatewayException(data.error?.message ?? 'Stripe refund failed');
      providerRefundId = data.id; providerStatus = data.status === 'succeeded' ? 'succeeded' : String(data.status ?? 'pending');
    } else {
      const token = await this.payPalToken();
      const body = { amount: { total: (refundAmount / 100).toFixed(2), currency: payment.currency }, description: reason.slice(0, 255) };
      const response = await fetch(`${this.payPalBase()}/v1/payments/sale/${encodeURIComponent(payment.providerPaymentId)}/refund`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `refund-${payment.id}-${refundAmount}` }, body: JSON.stringify(body) });
      const data = await this.json(response); if (!response.ok || !data.id) throw new BadGatewayException(data.message ?? 'PayPal refund failed');
      providerRefundId = data.id; providerStatus = String(data.state ?? 'pending');
    }
    const refund = this.transactions.create({ userId: payment.userId, provider: payment.provider, providerEventId: `manual-refund:${providerRefundId}`, providerPaymentId: providerRefundId, providerSubscriptionId: payment.providerSubscriptionId, parentTransactionId: payment.id, status: PaymentStatus.REFUNDED, amount: refundAmount, currency: payment.currency, description: `${reason} (${providerStatus})`, paidAt: new Date() });
    await this.transactions.save(refund); return refund;
  }

  async adminHistory(query: PaymentHistoryQuery = {}) {
    const result = await this.queryTransactions(query, true);
    const summaryQuery = this.filteredTransactions(query);
    const rows = await summaryQuery.getMany();
    const succeeded = rows.filter(row => row.status === PaymentStatus.SUCCEEDED);
    const refunded = rows.filter(row => row.status === PaymentStatus.REFUNDED);
    const currencyTotals = new Map<string, number>();
    for (const row of [...succeeded, ...refunded]) {
      const direction = row.status === PaymentStatus.REFUNDED ? -1 : 1;
      currencyTotals.set(row.currency, (currencyTotals.get(row.currency) ?? 0) + direction * row.amount);
    }
    const activeResult = await this.subscriptions.createQueryBuilder('subscription').select('COUNT(DISTINCT subscription.userId)', 'count').where('LOWER(subscription.status) IN (:...statuses)', { statuses: ['active', 'trialing'] }).getRawOne<{ count: string }>();
    const activeSubscribers = Number(activeResult?.count ?? 0);
    return {
      ...result,
      summary: {
        payments: rows.length,
        successful: succeeded.length,
        failed: rows.filter(row => row.status === PaymentStatus.FAILED).length,
        activeSubscribers,
        earnings: [...currencyTotals].map(([currency, amount]) => ({ currency, amount })),
      },
    };
  }

  async createStripeCheckout(user: UserAccount, planSlug = 'pro'): Promise<{ url: string }> {
    if (!this.config.enabled('stripe')) throw new ServiceUnavailableException('Stripe is disabled');
    const secret = this.config.required('stripeSecretKey', 'STRIPE_SECRET_KEY');
    const plan = this.plans.require(planSlug);
    if (plan.priceMonthly <= 0) throw new BadRequestException('Free plans do not require checkout');
    const price = plan.stripePriceId || this.config.required('stripePriceId', 'STRIPE_PRO_PRICE_ID');
    const appUrl = this.appUrl();
    const body = new URLSearchParams({
      mode: 'subscription',
      success_url: `${appUrl}/account?billing=success`,
      cancel_url: `${appUrl}/account?billing=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email,
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      'metadata[userId]': user.id,
      'metadata[planSlug]': plan.slug,
      'subscription_data[metadata][userId]': user.id,
      'subscription_data[metadata][planSlug]': plan.slug,
    });
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await this.json(response);
    if (!response.ok || typeof data.url !== 'string') throw new BadGatewayException(data.error?.message ?? 'Stripe checkout failed');
    return { url: data.url };
  }

  async createStripePortal(userId: string): Promise<{ url: string }> {
    const row = await this.subscriptions.findOne({ where: { userId, provider: BillingProvider.STRIPE }, order: { updatedAt: 'DESC' } });
    if (!row?.providerCustomerId) throw new NotFoundException('No Stripe customer exists for this account');
    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.required('stripeSecretKey', 'STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ customer: row.providerCustomerId, return_url: `${this.appUrl()}/account` }),
    });
    const data = await this.json(response);
    if (!response.ok || typeof data.url !== 'string') throw new BadGatewayException(data.error?.message ?? 'Stripe portal failed');
    return { url: data.url };
  }

  async handleStripe(raw: Buffer, signature?: string): Promise<void> {
    this.verifyStripe(raw, signature);
    const event = JSON.parse(raw.toString('utf8')) as Json;
    const object = event.data?.object as Json | undefined;
    if (!object) return;
    this.logger.log(`Stripe webhook received type=${String(event.type)} eventId=${String(event.id ?? 'unknown')}`);
    if (event.type === 'checkout.session.completed') {
      const userId = object.client_reference_id ?? object.metadata?.userId;
      const planSlug = String(object.metadata?.planSlug ?? 'pro');
      const paid = ['paid', 'no_payment_required'].includes(String(object.payment_status));
      const subscriptionId = this.stripeId(object.subscription);
      if (userId && subscriptionId) {
        await this.upsert(userId, BillingProvider.STRIPE, subscriptionId, this.stripeId(object.customer), paid ? 'active' : 'pending', undefined, undefined, planSlug);
        const checkoutAmount = Number(object.amount_total);
        if (paid && Number.isFinite(checkoutAmount) && checkoutAmount >= 0) {
          await this.recordTransaction({
            userId, provider: BillingProvider.STRIPE, providerEventId: String(event.id),
            providerPaymentId: this.stripeId(object.payment_intent) ?? object.id ?? null, providerSubscriptionId: subscriptionId,
            status: PaymentStatus.SUCCEEDED, amount: checkoutAmount, currency: String(object.currency ?? 'USD').toUpperCase(),
            description: checkoutAmount === 0 ? 'Pro subscription — no payment collected' : 'Pro monthly subscription', paidAt: new Date(Number(object.created ?? event.created ?? Date.now() / 1000) * 1000),
          });
          if (checkoutAmount === 0) this.logger.warn(`Stripe checkout completed with zero amount eventId=${String(event.id)} subscriptionId=${subscriptionId} price configuration or trial should be checked`);
        }
      } else this.logger.warn(`Stripe checkout could not be linked to a user eventId=${String(event.id)} userId=${String(userId ?? '')} subscriptionId=${String(object.subscription ?? '')}`);
      return;
    }
    if (String(event.type).startsWith('customer.subscription.')) {
      const existing = await this.subscriptions.findOneBy({ provider: BillingProvider.STRIPE, providerSubscriptionId: object.id });
      const userId = object.metadata?.userId ?? existing?.userId;
      if (!userId) { this.logger.warn(`Stripe subscription webhook could not be linked eventId=${String(event.id ?? 'unknown')} subscriptionId=${String(object.id ?? '')}`); return; }
      const status = event.type === 'customer.subscription.deleted' ? 'cancelled' : String(object.status ?? 'pending');
      const periodEnd = object.current_period_end ?? object.items?.data?.[0]?.current_period_end;
      await this.upsert(userId, BillingProvider.STRIPE, object.id, this.stripeId(object.customer), status, periodEnd, Boolean(object.cancel_at_period_end), String(object.metadata?.planSlug ?? existing?.planSlug ?? 'pro'));
      return;
    }
    if (['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed', 'charge.refunded'].includes(String(event.type))) await this.recordStripePayment(event, object);
  }

  async createPayPalSubscription(user: UserAccount, planSlug = 'pro'): Promise<{ id: string; url: string }> {
    const plan = this.plans.require(planSlug);
    if (plan.priceMonthly <= 0) throw new BadRequestException('Free plans do not require checkout');
    const token = await this.payPalToken();
    const response = await fetch(`${this.payPalBase()}/v1/billing/subscriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        plan_id: plan.paypalPlanId || this.config.required('paypalPlanId', 'PAYPAL_PRO_PLAN_ID'), custom_id: `${user.id}:${plan.slug}`,
        subscriber: { name: { given_name: user.name }, email_address: user.email },
        application_context: { return_url: `${this.appUrl()}/account?billing=success`, cancel_url: `${this.appUrl()}/account?billing=cancelled`, user_action: 'SUBSCRIBE_NOW' },
      }),
    });
    const data = await this.json(response);
    const approve = Array.isArray(data.links) ? data.links.find((link: Json) => link.rel === 'approve')?.href : undefined;
    if (!response.ok || !data.id || !approve) throw new BadGatewayException(data.message ?? 'PayPal subscription failed');
    await this.upsert(user.id, BillingProvider.PAYPAL, data.id, null, String(data.status ?? 'APPROVAL_PENDING').toLowerCase(), undefined, undefined, plan.slug);
    return { id: data.id, url: approve };
  }

  async handlePayPal(headers: Record<string, string | string[] | undefined>, event: Json): Promise<void> {
    if (!(await this.verifyPayPal(headers, event))) throw new UnauthorizedException('Invalid PayPal webhook signature');
    const resource = event.resource as Json | undefined;
    if (!resource) return;
    const resourceSubscriptionId = resource.billing_agreement_id ?? resource.id;
    const existing = resourceSubscriptionId ? await this.subscriptions.findOneBy({ provider: BillingProvider.PAYPAL, providerSubscriptionId: resourceSubscriptionId }) : null;
    const customParts = typeof resource.custom_id === 'string' ? resource.custom_id.split(':') : [];
    const userId = customParts[0] || existing?.userId;
    const planSlug = customParts[1] || existing?.planSlug || 'pro';
    if (!userId) { this.logger.warn(`PayPal webhook could not be linked to a user type=${String(event.event_type)} eventId=${String(event.id ?? 'unknown')} subscriptionId=${String(resourceSubscriptionId ?? '')}`); return; }
    const eventType = String(event.event_type);
    this.logger.log(`PayPal webhook received type=${eventType} eventId=${String(event.id ?? 'unknown')}`);
    const statusByEvent: Record<string, string> = {
      'BILLING.SUBSCRIPTION.ACTIVATED': 'active', 'BILLING.SUBSCRIPTION.CANCELLED': 'cancelled',
      'BILLING.SUBSCRIPTION.SUSPENDED': 'suspended', 'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
    };
    const subscriptionId = resourceSubscriptionId;
    if (eventType.startsWith('BILLING.SUBSCRIPTION.')) await this.upsert(userId, BillingProvider.PAYPAL, subscriptionId, resource.subscriber?.payer_id ?? null, statusByEvent[eventType] ?? String(resource.status ?? 'pending').toLowerCase(), undefined, undefined, planSlug);
    if (['PAYMENT.SALE.COMPLETED', 'PAYMENT.SALE.DENIED', 'PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'].includes(eventType)) {
      const amount = resource.amount ?? resource.amount_with_breakdown?.gross_amount ?? {};
      const originalPaymentId = resource.sale_id ?? resource.id;
      const parent = ['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'].includes(eventType) ? await this.transactions.findOneBy({ provider: BillingProvider.PAYPAL, providerPaymentId: originalPaymentId, status: PaymentStatus.SUCCEEDED }) : null;
      await this.recordTransaction({
        userId, provider: BillingProvider.PAYPAL, providerEventId: String(event.id),
        providerPaymentId: resource.id ?? null, providerSubscriptionId: subscriptionId ?? null, parentTransactionId: parent?.id ?? null,
        status: eventType === 'PAYMENT.SALE.COMPLETED' ? PaymentStatus.SUCCEEDED : ['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'].includes(eventType) ? PaymentStatus.REFUNDED : PaymentStatus.FAILED,
        amount: this.decimalToMinor(amount.total ?? amount.value), currency: String(amount.currency ?? amount.currency_code ?? 'USD').toUpperCase(),
        description: resource.note ?? 'Pro monthly subscription', paidAt: new Date(event.create_time ?? Date.now()),
      });
    }
  }

  private async recordStripePayment(event: Json, object: Json) {
    const subscriptionId = this.stripeInvoiceSubscriptionId(object);
    const customerId = this.stripeId(object.customer);
    const paymentId = this.stripeInvoicePaymentId(object);
    const existing = subscriptionId
      ? await this.subscriptions.findOneBy({ provider: BillingProvider.STRIPE, providerSubscriptionId: subscriptionId })
      : customerId ? await this.subscriptions.findOne({ where: { provider: BillingProvider.STRIPE, providerCustomerId: customerId }, order: { updatedAt: 'DESC' } }) : null;
    const previousPayment = !existing && paymentId ? await this.transactions.findOneBy({ provider: BillingProvider.STRIPE, providerPaymentId: paymentId }) : null;
    const parentMetadata = object.parent?.type === 'subscription_details' ? object.parent?.subscription_details?.metadata : undefined;
    let userId = object.metadata?.userId ?? parentMetadata?.userId ?? existing?.userId ?? previousPayment?.userId;
    if (!userId && object.customer_email) userId = (await this.users.findOneBy({ email: String(object.customer_email).toLowerCase() }))?.id;
    if (!userId) { this.logger.warn(`Stripe payment could not be linked to a user type=${String(event.type)} eventId=${String(event.id ?? 'unknown')} subscriptionId=${String(subscriptionId ?? '')}`); return; }
    const refunded = event.type === 'charge.refunded';
    let amount = Number(refunded ? object.amount_refunded : object.amount_paid ?? object.amount_due ?? 0);
    let parentTransactionId: string | null = null;
    if (refunded && previousPayment) {
      parentTransactionId = previousPayment.id;
      const recorded = await this.transactions.find({ where: { parentTransactionId, status: PaymentStatus.REFUNDED } });
      amount -= recorded.reduce((sum, row) => sum + row.amount, 0);
      if (amount <= 0) return;
    }
    await this.recordTransaction({
      userId, provider: BillingProvider.STRIPE, providerEventId: String(event.id), providerPaymentId: paymentId ?? object.id ?? null,
      providerSubscriptionId: subscriptionId ?? null, parentTransactionId,
      status: refunded ? PaymentStatus.REFUNDED : ['invoice.paid', 'invoice.payment_succeeded'].includes(String(event.type)) ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
      amount,
      currency: String(object.currency ?? 'USD').toUpperCase(), description: object.description ?? 'Pro monthly subscription',
      paidAt: new Date(Number(object.status_transitions?.paid_at ?? object.created ?? event.created ?? Date.now() / 1000) * 1000),
    });
  }

  private async recordTransaction(input: Partial<PaymentTransaction> & Pick<PaymentTransaction, 'userId' | 'provider' | 'providerEventId' | 'status' | 'amount' | 'currency'>) {
    if (await this.transactions.findOneBy({ provider: input.provider, providerEventId: input.providerEventId })) { this.logger.debug(`Payment webhook already recorded provider=${input.provider} eventId=${input.providerEventId}`); return; }
    if (input.status === PaymentStatus.REFUNDED && input.providerPaymentId && await this.transactions.findOneBy({ provider: input.provider, providerPaymentId: input.providerPaymentId, status: PaymentStatus.REFUNDED })) { this.logger.debug(`Refund already recorded provider=${input.provider} paymentId=${input.providerPaymentId}`); return; }
    if (input.status === PaymentStatus.SUCCEEDED && input.providerSubscriptionId) {
      const recent = await this.transactions.createQueryBuilder('payment').where('payment.provider = :provider', { provider: input.provider }).andWhere('payment.providerSubscriptionId = :subscriptionId', { subscriptionId: input.providerSubscriptionId }).andWhere('payment.status = :status', { status: PaymentStatus.SUCCEEDED }).andWhere('payment.amount = :amount', { amount: input.amount }).andWhere('payment.createdAt >= :recent', { recent: new Date(Date.now() - 15 * 60 * 1000) }).orderBy('payment.createdAt', 'DESC').getOne();
      if (recent) {
        if ((!recent.providerPaymentId || recent.providerPaymentId.startsWith('cs_')) && input.providerPaymentId) { recent.providerPaymentId = input.providerPaymentId; await this.transactions.save(recent); }
        this.logger.debug(`Successful payment matched existing checkout provider=${input.provider} subscriptionId=${input.providerSubscriptionId}`); return;
      }
    }
    const saved = await this.transactions.save(this.transactions.create(input));
    this.logger.log(`Payment recorded id=${saved.id} provider=${saved.provider} status=${saved.status} amount=${saved.amount} currency=${saved.currency} userId=${saved.userId}`);
  }

  private filteredTransactions(query: PaymentHistoryQuery) {
    const qb = this.transactions.createQueryBuilder('payment');
    if (query.userId) qb.andWhere('payment.userId = :userId', { userId: query.userId });
    if (query.provider) qb.andWhere('payment.provider = :provider', { provider: query.provider });
    if (query.status) qb.andWhere('payment.status = :status', { status: query.status });
    if (query.from) qb.andWhere('payment.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) { const to = new Date(query.to); if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setHours(23, 59, 59, 999); qb.andWhere('payment.createdAt <= :to', { to }); }
    if (query.search) qb.andWhere(new Brackets(inner => inner.where('payment.providerPaymentId LIKE :search', { search: `%${query.search}%` }).orWhere('payment.providerSubscriptionId LIKE :search', { search: `%${query.search}%` })));
    return qb;
  }

  private async queryTransactions(query: PaymentHistoryQuery, includeUser = false) {
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.filteredTransactions(query).orderBy('payment.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    const refunds = items.length ? await this.transactions.find({ where: { parentTransactionId: In(items.map(item => item.id)), status: PaymentStatus.REFUNDED } }) : [];
    const refundedByPayment = new Map<string, number>();
    for (const refund of refunds) refundedByPayment.set(String(refund.parentTransactionId), (refundedByPayment.get(String(refund.parentTransactionId)) ?? 0) + refund.amount);
    const enriched = items.map(item => ({ ...item, refundedAmount: refundedByPayment.get(item.id) ?? 0 }));
    if (!includeUser) return { items: enriched, total, page, limit };
    const users = await this.users.findBy({ id: In([...new Set(items.map(item => item.userId))]) });
    const lookup = new Map(users.map(user => [user.id, { id: user.id, name: user.name, email: user.email, username: user.username }]));
    return { items: enriched.map(item => ({ ...item, user: lookup.get(item.userId) ?? null })), total, page, limit };
  }

  private decimalToMinor(value: unknown) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 100) : 0; }
  private stripeId(value: unknown): string | null {
    if (typeof value === 'string' && value) return value;
    if (value && typeof value === 'object' && typeof (value as Json).id === 'string') return (value as Json).id;
    return null;
  }
  private stripeInvoiceSubscriptionId(invoice: Json): string | null {
    const legacy = this.stripeId(invoice.subscription);
    if (legacy) return legacy;
    if (invoice.parent?.type === 'subscription_details') return this.stripeId(invoice.parent.subscription_details?.subscription);
    return null;
  }
  private stripeInvoicePaymentId(invoice: Json): string | null {
    const legacy = this.stripeId(invoice.payment_intent);
    if (legacy) return legacy;
    const payments = Array.isArray(invoice.payments?.data) ? invoice.payments.data : [];
    for (const invoicePayment of payments) {
      const paymentIntent = this.stripeId(invoicePayment?.payment?.payment_intent);
      if (paymentIntent) return paymentIntent;
      const charge = this.stripeId(invoicePayment?.payment?.charge);
      if (charge) return charge;
    }
    return null;
  }

  private async upsert(userId: string, provider: BillingProvider, subscriptionId: string, customerId: string | null, status: string, periodEnd?: number, cancelAtPeriodEnd?: boolean, planSlug = 'pro') {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) return;
    let row = await this.subscriptions.findOne({ where: [{ provider, providerSubscriptionId: subscriptionId }, { provider, userId }] });
    row ??= this.subscriptions.create({ userId, provider });
    Object.assign(row, { providerSubscriptionId: subscriptionId, providerCustomerId: customerId, status, planSlug, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : row.currentPeriodEnd, ...(cancelAtPeriodEnd === undefined ? {} : { cancelAtPeriodEnd }) });
    await this.subscriptions.save(row);
    await this.refreshUserPlan(userId);
  }

  private async refreshUserPlan(userId: string) {
    const user = await this.users.findOneBy({ id: userId }); if (!user) return;
    const all = await this.subscriptions.find({ where: { userId } }); const now = Date.now();
    const active = all.filter(subscription => ['active', 'trialing'].includes(subscription.status.toLowerCase()) && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() > now)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const nextPlan = active?.planSlug ?? UserPlan.FREE;
    if (user.plan !== nextPlan && nextPlan !== UserPlan.FREE) {
      user.sentMessages = 0; user.receivedMessages = 0; user.aiTokensUsed = 0; user.usagePeriodStart = new Date();
    }
    user.plan = nextPlan;
    await this.users.save(user);
  }

  private async subscriptionForAction(id: string, userId?: string) {
    const row = await this.subscriptions.findOneBy({ id });
    if (!row || (userId && row.userId !== userId)) throw new NotFoundException('Subscription not found');
    return row;
  }

  private stripeUpdateSubscription(id: string, values: Record<string, string>) {
    return fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.required('stripeSecretKey', 'STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });
  }

  private verifyStripe(raw: Buffer, header?: string) {
    const secret = this.config.required('stripeWebhookSecret', 'STRIPE_WEBHOOK_SECRET');
    const parts = Object.fromEntries((header ?? '').split(',').map(part => part.split('=', 2)));
    const timestamp = Number(parts.t);
    if (!timestamp || !parts.v1 || Math.abs(Date.now() / 1000 - timestamp) > 300) throw new UnauthorizedException('Invalid Stripe signature');
    const expected = createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(parts.v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid Stripe signature');
  }

  private async verifyPayPal(headers: Record<string, string | string[] | undefined>, event: Json): Promise<boolean> {
    const token = await this.payPalToken();
    const value = (name: string) => String(headers[name] ?? headers[name.toLowerCase()] ?? '');
    const response = await fetch(`${this.payPalBase()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_algo: value('paypal-auth-algo'), cert_url: value('paypal-cert-url'), transmission_id: value('paypal-transmission-id'), transmission_sig: value('paypal-transmission-sig'), transmission_time: value('paypal-transmission-time'), webhook_id: this.config.required('paypalWebhookId', 'PAYPAL_WEBHOOK_ID'), webhook_event: event }),
    });
    const data = await this.json(response);
    return response.ok && data.verification_status === 'SUCCESS';
  }

  private async payPalToken(): Promise<string> {
    if (!this.config.enabled('paypal')) throw new ServiceUnavailableException('PayPal is disabled');
    const credentials = Buffer.from(`${this.config.required('paypalClientId', 'PAYPAL_CLIENT_ID')}:${this.config.required('paypalClientSecret', 'PAYPAL_CLIENT_SECRET')}`).toString('base64');
    const response = await fetch(`${this.payPalBase()}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    const data = await this.json(response);
    if (!response.ok || !data.access_token) throw new BadGatewayException('Unable to authenticate with PayPal');
    return data.access_token;
  }

  private payPalBase() { return this.config.value('paypalEnvironment', 'PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
  private appUrl() { return String(this.config.value('publicAppUrl', 'PUBLIC_APP_URL') || 'http://localhost:2886').replace(/\/$/, ''); }
  private async json(response: Response): Promise<Json> { return response.json().catch(() => ({})) as Promise<Json>; }
}

export interface PaymentHistoryQuery {
  userId?: string; provider?: BillingProvider; status?: PaymentStatus; from?: string; to?: string; search?: string; page?: number; limit?: number;
}
export interface SubscriptionQuery { userId?: string; provider?: BillingProvider; status?: string; }
