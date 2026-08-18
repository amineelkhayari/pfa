import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { UserAccount, UserPlan } from '../auth/entities/user-account.entity';
import { BillingProvider, BillingSubscription } from './entities/subscription.entity';
import { BillingConfigService } from './billing-config.service';

type Json = Record<string, any>;

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingSubscription, 'main') private readonly subscriptions: Repository<BillingSubscription>,
    @InjectRepository(UserAccount, 'main') private readonly users: Repository<UserAccount>,
    private readonly config: BillingConfigService,
  ) {}

  status(userId: string) {
    return this.subscriptions.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  async createStripeCheckout(user: UserAccount): Promise<{ url: string }> {
    if (!this.config.enabled('stripe')) throw new ServiceUnavailableException('Stripe is disabled');
    const secret = this.config.required('stripeSecretKey', 'STRIPE_SECRET_KEY');
    const price = this.config.required('stripePriceId', 'STRIPE_PRO_PRICE_ID');
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
      'subscription_data[metadata][userId]': user.id,
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
    if (event.type === 'checkout.session.completed') {
      const userId = object.client_reference_id ?? object.metadata?.userId;
      const paid = ['paid', 'no_payment_required'].includes(String(object.payment_status));
      if (userId && object.subscription) {
        await this.upsert(userId, BillingProvider.STRIPE, object.subscription, object.customer, paid ? 'active' : 'pending');
      }
      return;
    }
    if (String(event.type).startsWith('customer.subscription.')) {
      const existing = await this.subscriptions.findOneBy({ provider: BillingProvider.STRIPE, providerSubscriptionId: object.id });
      const userId = object.metadata?.userId ?? existing?.userId;
      if (!userId) return;
      const status = event.type === 'customer.subscription.deleted' ? 'cancelled' : String(object.status ?? 'pending');
      await this.upsert(userId, BillingProvider.STRIPE, object.id, object.customer, status, object.current_period_end);
    }
  }

  async createPayPalSubscription(user: UserAccount): Promise<{ id: string; url: string }> {
    const token = await this.payPalToken();
    const response = await fetch(`${this.payPalBase()}/v1/billing/subscriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        plan_id: this.config.required('paypalPlanId', 'PAYPAL_PRO_PLAN_ID'), custom_id: user.id,
        subscriber: { name: { given_name: user.name }, email_address: user.email },
        application_context: { return_url: `${this.appUrl()}/account?billing=success`, cancel_url: `${this.appUrl()}/account?billing=cancelled`, user_action: 'SUBSCRIBE_NOW' },
      }),
    });
    const data = await this.json(response);
    const approve = Array.isArray(data.links) ? data.links.find((link: Json) => link.rel === 'approve')?.href : undefined;
    if (!response.ok || !data.id || !approve) throw new BadGatewayException(data.message ?? 'PayPal subscription failed');
    await this.upsert(user.id, BillingProvider.PAYPAL, data.id, null, String(data.status ?? 'APPROVAL_PENDING').toLowerCase());
    return { id: data.id, url: approve };
  }

  async handlePayPal(headers: Record<string, string | string[] | undefined>, event: Json): Promise<void> {
    if (!(await this.verifyPayPal(headers, event))) throw new UnauthorizedException('Invalid PayPal webhook signature');
    const resource = event.resource as Json | undefined;
    if (!resource) return;
    const existing = resource.id ? await this.subscriptions.findOneBy({ provider: BillingProvider.PAYPAL, providerSubscriptionId: resource.id }) : null;
    const userId = resource.custom_id ?? existing?.userId;
    if (!userId) return;
    const statusByEvent: Record<string, string> = {
      'BILLING.SUBSCRIPTION.ACTIVATED': 'active', 'BILLING.SUBSCRIPTION.CANCELLED': 'cancelled',
      'BILLING.SUBSCRIPTION.SUSPENDED': 'suspended', 'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
    };
    await this.upsert(userId, BillingProvider.PAYPAL, resource.id, resource.subscriber?.payer_id ?? null, statusByEvent[event.event_type] ?? String(resource.status ?? 'pending').toLowerCase());
  }

  private async upsert(userId: string, provider: BillingProvider, subscriptionId: string, customerId: string | null, status: string, periodEnd?: number) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) return;
    let row = await this.subscriptions.findOne({ where: [{ provider, providerSubscriptionId: subscriptionId }, { provider, userId }] });
    row ??= this.subscriptions.create({ userId, provider });
    Object.assign(row, { providerSubscriptionId: subscriptionId, providerCustomerId: customerId, status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : row.currentPeriodEnd });
    await this.subscriptions.save(row);
    const all = await this.subscriptions.find({ where: { userId } });
    user.plan = all.some(subscription => ['active', 'trialing'].includes(subscription.status.toLowerCase()))
      ? UserPlan.PRO
      : UserPlan.FREE;
    await this.users.save(user);
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
