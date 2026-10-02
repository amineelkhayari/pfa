import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingProvider, PlanChangeStatus } from './entities/subscription.entity';
import { PaymentStatus } from './entities/payment-transaction.entity';

describe('BillingService Stripe refund references', () => {
  const originalFetch = global.fetch;
  let service: BillingService;
  let subscriptions: { find: jest.Mock; save: jest.Mock; findOneBy: jest.Mock; findOne: jest.Mock };
  let transactions: { create: jest.Mock; save: jest.Mock; findOneBy: jest.Mock; find: jest.Mock };
  let users: { findOneBy: jest.Mock; save: jest.Mock };
  let plans: { require: jest.Mock; get: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    subscriptions = {
      find: jest.fn(),
      save: jest.fn(async value => value),
      findOneBy: jest.fn(),
      findOne: jest.fn(),
    };
    users = { findOneBy: jest.fn(), save: jest.fn(async value => value) };
    plans = {
      require: jest.fn((slug: string) => ({ slug, priceMonthly: slug === 'basic' ? 200 : 500, currency: 'USD' })),
      get: jest.fn(),
      list: jest.fn().mockReturnValue([]),
    };
    transactions = {
      create: jest.fn((val) => val),
      save: jest.fn(async (val) => val),
      findOneBy: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    service = new BillingService(
      subscriptions as any,
      transactions as any,
      users as any,
      {
        required: jest.fn().mockReturnValue('sk_test_secret'),
        enabled: jest.fn().mockReturnValue(false),
        value: jest.fn().mockReturnValue('sandbox'),
      } as any,
      plans as any,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses an existing PaymentIntent without a provider lookup', async () => {
    global.fetch = jest.fn() as any;

    await expect((service as any).resolveStripeRefundReference('pi_test_123')).resolves.toEqual({
      field: 'payment_intent',
      id: 'pi_test_123',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves a Basil invoice through the Invoice Payments API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_from_invoice' } }],
      }),
    }) as any;

    await expect((service as any).resolveStripeRefundReference('in_test_123')).resolves.toEqual({
      field: 'payment_intent',
      id: 'pi_from_invoice',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/invoice_payments?invoice=in_test_123'),
      expect.objectContaining({ headers: { Authorization: 'Bearer sk_test_secret' } }),
    );
  });

  it('supports invoice payments backed directly by a Charge', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ status: 'paid', payment: { type: 'charge', charge: 'ch_from_invoice' } }],
      }),
    }) as any;

    await expect((service as any).resolveStripeRefundReference('in_test_charge')).resolves.toEqual({
      field: 'charge',
      id: 'ch_from_invoice',
    });
  });

  it('rejects invoice records that did not collect a refundable payment', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as any;

    await expect((service as any).resolveStripeRefundReference('in_unpaid')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks another switch while a plan change is in progress', () => {
    const subscription = {
      status: 'active', planSlug: 'basic', planChangeStatus: PlanChangeStatus.PENDING_PAYMENT,
    };

    expect(() => (service as any).validatePlanChange(subscription, 'pro')).toThrow('A plan change is already pending');
  });

  it('completes a plan change without leaving a pending target behind', () => {
    const subscription = {
      planSlug: 'basic', pendingPlanSlug: 'pro', planChangeStatus: PlanChangeStatus.PENDING_PAYMENT,
      planChangeEffectiveAt: new Date(), planChangeError: 'old failure',
    };

    (service as any).applyCompletedPlanChange(subscription, 'pro');

    expect(subscription).toMatchObject({
      planSlug: 'pro', pendingPlanSlug: null, planChangeStatus: PlanChangeStatus.COMPLETED,
      planChangeEffectiveAt: null, planChangeError: null,
    });
  });

  it('preserves usage counters when switching between paid plans', async () => {
    const user = { id: 'user-1', plan: 'basic', sentMessages: 91, receivedMessages: 72, aiTokensUsed: 1234 };
    const active = { status: 'active', planSlug: 'pro', currentPeriodEnd: new Date(Date.now() + 60_000), updatedAt: new Date() };
    users.findOneBy.mockResolvedValue(user);
    subscriptions.find.mockResolvedValue([active]);

    await (service as any).refreshUserPlan(user.id);

    expect(user).toMatchObject({ plan: 'pro', sentMessages: 91, receivedMessages: 72, aiTokensUsed: 1234 });
    expect(users.save).toHaveBeenCalledWith(user);
  });

  it('resets the usage cycle only on the first paid activation', async () => {
    const user = { id: 'user-1', plan: 'free', sentMessages: 20, receivedMessages: 20, aiTokensUsed: 5000 };
    const active = { provider: BillingProvider.STRIPE, status: 'active', planSlug: 'pro', currentPeriodEnd: new Date(Date.now() + 60_000), updatedAt: new Date() };
    users.findOneBy.mockResolvedValue(user);
    subscriptions.find.mockResolvedValue([active]);

    await (service as any).refreshUserPlan(user.id);

    expect(user).toMatchObject({ plan: 'pro', sentMessages: 0, receivedMessages: 0, aiTokensUsed: 0 });
    expect(user.usagePeriodStart).toBeInstanceOf(Date);
  });

  it('lists available quota addons', () => {
    const addons = service.listAddons();
    expect(addons.length).toBeGreaterThanOrEqual(4);
    expect(addons.map((a) => a.key)).toContain('extra_session');
    expect(addons.map((a) => a.key)).toContain('extra_store');
    expect(addons.map((a) => a.key)).toContain('extra_messages_1k');
    expect(addons.map((a) => a.key)).toContain('extra_ai_tokens_50k');
  });

  it('applies quota addon and increments extraQuota on user account', async () => {
    const user = { id: 'user-addon-1', plan: 'pro', settings: { extraQuota: { sessions: 1 } } };
    users.findOneBy.mockResolvedValue(user);

    const result = await service.applyQuotaAddon('user-addon-1', 'extra_session', 2);

    expect(result.success).toBe(true);
    expect(result.extraQuota.sessions).toBe(3);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          extraQuota: expect.objectContaining({ sessions: 3 }),
        }),
      }),
    );
  });

  it('handles already inactive PayPal subscription on cancelSubscription gracefully', async () => {
    const subscription = {
      id: 'sub-paypal-1',
      userId: 'user-1',
      provider: BillingProvider.PAYPAL,
      providerSubscriptionId: 'I-ALREADY-CANCELLED',
      status: 'active',
      cancelAtPeriodEnd: false,
    };
    const user = { id: 'user-1', plan: 'pro' };

    subscriptions.findOneBy.mockResolvedValue(subscription);
    subscriptions.find.mockResolvedValue([]);
    users.findOneBy.mockResolvedValue(user);

    jest.spyOn(service as any, 'payPalToken').mockResolvedValue('token-123');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        name: 'UNPROCESSABLE_ENTITY',
        message: 'The requested action cannot be performed for the subscription.',
        details: [{ issue: 'SUBSCRIPTION_STATUS_INVALID', description: 'Subscription is not active.' }],
      }),
    }) as any;

    const result = await service.cancelSubscription('sub-paypal-1', 'user-1', true);
    expect(result.status).toBe('cancelled');
    expect(subscriptions.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub-paypal-1', status: 'cancelled' }),
    );
    expect(user.plan).toBe('free');
  });

  it('cancels active subscription and downgrades user to free when payment is refunded', async () => {
    const payment = {
      id: 'tx-1',
      userId: 'user-1',
      provider: BillingProvider.STRIPE,
      providerPaymentId: 'pi_test_123',
      providerSubscriptionId: 'sub_stripe_1',
      status: PaymentStatus.SUCCEEDED,
      amount: 2900,
      currency: 'USD',
    };
    const subscription = {
      id: 'sub-1',
      userId: 'user-1',
      provider: BillingProvider.STRIPE,
      providerSubscriptionId: 'sub_stripe_1',
      status: 'active',
      cancelAtPeriodEnd: false,
    };
    const user = { id: 'user-1', plan: 'pro' };

    transactions.findOneBy.mockResolvedValue(payment);
    transactions.find.mockResolvedValue([]);
    subscriptions.findOneBy.mockImplementation(async (criteria: any) => {
      if (criteria?.providerSubscriptionId === 'sub_stripe_1' || criteria?.id === 'sub-1') return subscription;
      return null;
    });
    subscriptions.find.mockResolvedValue([]);
    users.findOneBy.mockResolvedValue(user);

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/refunds')) {
        return { ok: true, json: async () => ({ id: 're_123', status: 'succeeded' }) };
      }
      if (url.includes('/v1/subscriptions/sub_stripe_1')) {
        return { ok: true, json: async () => ({ id: 'sub_stripe_1', status: 'canceled' }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as any;

    const refund = await service.refundPayment('tx-1', 2900, 'Customer refund request');

    expect(refund.status).toBe(PaymentStatus.REFUNDED);
    expect(subscription.status).toBe('cancelled');
    expect(user.plan).toBe('free');
  });

  it('marks active subscription as cancelled and downgrades user to free when transactions show full refund', async () => {
    const user = { id: 'user-refunded', plan: 'pro' };
    const activeSub = {
      id: 'sub-refunded',
      userId: 'user-refunded',
      provider: BillingProvider.PAYPAL,
      providerSubscriptionId: 'I-REFUNDED-1',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 86400000),
      updatedAt: new Date(),
    };
    const txSucceeded = {
      id: 'tx-succ',
      providerSubscriptionId: 'I-REFUNDED-1',
      status: PaymentStatus.SUCCEEDED,
      amount: 500,
    };
    const txRefunded = {
      id: 'tx-ref',
      providerSubscriptionId: 'I-REFUNDED-1',
      status: PaymentStatus.REFUNDED,
      amount: 500,
    };

    users.findOneBy.mockResolvedValue(user);
    subscriptions.find.mockResolvedValue([activeSub]);
    transactions.find.mockResolvedValue([txSucceeded, txRefunded]);

    await (service as any).refreshUserPlan('user-refunded');

    expect(activeSub.status).toBe('cancelled');
    expect(subscriptions.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub-refunded', status: 'cancelled' }),
    );
    expect(user.plan).toBe('free');
  });

  describe('Customer refund requests (2-day rule)', () => {
    it('allows a customer to request a refund for a successful payment within 48 hours', async () => {
      const payment = {
        id: 'tx-recent',
        userId: 'user-cust-1',
        status: PaymentStatus.SUCCEEDED,
        amount: 2900,
        currency: 'USD',
        paidAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        refundRequestStatus: 'none',
      };
      transactions.findOneBy.mockResolvedValue(payment);
      transactions.find.mockResolvedValue([]);

      const result = await service.requestPaymentRefund('tx-recent', 'user-cust-1', 'Not satisfied');

      expect(payment.refundRequestStatus).toBe('pending');
      expect(payment.refundRequestReason).toBe('Not satisfied');
      expect(transactions.save).toHaveBeenCalledWith(payment);
    });

    it('rejects refund request if payment was made more than 48 hours (2 days) ago', async () => {
      const payment = {
        id: 'tx-old',
        userId: 'user-cust-1',
        status: PaymentStatus.SUCCEEDED,
        amount: 2900,
        currency: 'USD',
        paidAt: new Date(Date.now() - 49 * 3600 * 1000), // 49 hours ago (> 2 days)
        refundRequestStatus: 'none',
      };
      transactions.findOneBy.mockResolvedValue(payment);

      await expect(
        service.requestPaymentRefund('tx-old', 'user-cust-1', 'Too late'),
      ).rejects.toThrow('Refund requests must be submitted within 2 days');
    });

    it('rejects refund request if another request is already pending', async () => {
      const payment = {
        id: 'tx-pending',
        userId: 'user-cust-1',
        status: PaymentStatus.SUCCEEDED,
        amount: 2900,
        currency: 'USD',
        paidAt: new Date(Date.now() - 1000),
        refundRequestStatus: 'pending',
      };
      transactions.findOneBy.mockResolvedValue(payment);

      await expect(
        service.requestPaymentRefund('tx-pending', 'user-cust-1', 'Duplicate'),
      ).rejects.toThrow('A refund request is already pending for this payment');
    });

    it('allows admin to approve a pending refund request and processes the refund', async () => {
      const payment = {
        id: 'tx-to-approve',
        userId: 'user-cust-1',
        provider: BillingProvider.STRIPE,
        providerPaymentId: 'pi_test_approve',
        status: PaymentStatus.SUCCEEDED,
        amount: 2000,
        currency: 'USD',
        refundRequestStatus: 'pending',
        refundRequestReason: 'Customer requested refund',
      };
      transactions.findOneBy.mockResolvedValue(payment);
      transactions.find.mockResolvedValue([]);
      subscriptions.findOne.mockResolvedValue(null);
      subscriptions.find.mockResolvedValue([]);
      users.findOneBy.mockResolvedValue({ id: 'user-cust-1', plan: 'pro' });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 're_approved_1', status: 'succeeded' }),
      }) as any;

      const refund = await service.approvePaymentRefund('tx-to-approve');

      expect(payment.refundRequestStatus).toBe('approved');
      expect(refund.status).toBe(PaymentStatus.REFUNDED);
    });

    it('allows admin to reject a pending refund request with a reason', async () => {
      const payment = {
        id: 'tx-to-reject',
        userId: 'user-cust-1',
        status: PaymentStatus.SUCCEEDED,
        amount: 2000,
        currency: 'USD',
        refundRequestStatus: 'pending',
      };
      transactions.findOneBy.mockResolvedValue(payment);

      const result = await service.rejectPaymentRefund('tx-to-reject', 'Policy breach');

      expect(payment.refundRequestStatus).toBe('rejected');
      expect(payment.refundRejectionReason).toBe('Policy breach');
      expect(transactions.save).toHaveBeenCalledWith(payment);
    });
  });

  describe('Paid plan trial period', () => {
    it('sets subscription_data[trial_period_days] in Stripe checkout when plan has trialDays > 0', async () => {
      plans.require.mockReturnValue({
        slug: 'pro-trial',
        priceMonthly: 2900,
        currency: 'USD',
        stripePriceId: 'price_pro_trial',
        trialDays: 3,
      });
      subscriptions.find.mockResolvedValue([]);

      let capturedBody: URLSearchParams | null = null;
      global.fetch = jest.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = init.body;
        return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_test' }) };
      }) as any;

      (service as any).config.enabled = jest.fn().mockReturnValue(true);

      const res = await service.createStripeCheckout({ id: 'user-trial', email: 'test@user.com' } as any, 'pro-trial');

      expect(res.url).toBe('https://checkout.stripe.com/pay/cs_test');
      expect(capturedBody).toBeInstanceOf(URLSearchParams);
      expect(capturedBody?.get('subscription_data[trial_period_days]')).toBe('3');
    });

    it('sets start_time in PayPal subscription creation when plan has trialDays > 0', async () => {
      plans.require.mockReturnValue({
        slug: 'pro-paypal-trial',
        priceMonthly: 2900,
        currency: 'USD',
        paypalPlanId: 'P-TRIAL-123',
        trialDays: 3,
      });
      subscriptions.find.mockResolvedValue([]);

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation(async (url: string, init: any) => {
        if (url.includes('/v1/oauth2/token')) {
          return { ok: true, json: async () => ({ access_token: 'fake-token' }) };
        }
        if (url.includes('/v1/billing/subscriptions')) {
          capturedPayload = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({
              id: 'I-TRIAL-PAYPAL',
              status: 'APPROVAL_PENDING',
              links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=xyz' }],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }) as any;

      (service as any).config.enabled = jest.fn().mockReturnValue(true);

      const res = await service.createPayPalSubscription({ id: 'user-paypal', name: 'PayPal User', email: 'pp@user.com' } as any, 'pro-paypal-trial');

      expect(res.url).toBe('https://www.paypal.com/checkoutnow?token=xyz');
      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.start_time).toBeDefined();
      const startTime = new Date(capturedPayload.start_time).getTime();
      const now = Date.now();
      // Should be around ~3 days (259,200,000 ms) in future
      expect(startTime - now).toBeGreaterThan(2 * 86400000);
      expect(startTime - now).toBeLessThanOrEqual(3 * 86400000 + 5000);
    });
  });
});

