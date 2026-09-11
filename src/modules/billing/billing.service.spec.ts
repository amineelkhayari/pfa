import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingProvider, PlanChangeStatus } from './entities/subscription.entity';

describe('BillingService Stripe refund references', () => {
  const originalFetch = global.fetch;
  let service: BillingService;
  let subscriptions: { find: jest.Mock; save: jest.Mock };
  let users: { findOneBy: jest.Mock; save: jest.Mock };
  let plans: { require: jest.Mock; get: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    subscriptions = { find: jest.fn(), save: jest.fn(async value => value) };
    users = { findOneBy: jest.fn(), save: jest.fn(async value => value) };
    plans = {
      require: jest.fn((slug: string) => ({ slug, priceMonthly: slug === 'basic' ? 200 : 500, currency: 'USD' })),
      get: jest.fn(),
      list: jest.fn().mockReturnValue([]),
    };
    service = new BillingService(
      subscriptions as any,
      {} as any,
      users as any,
      { required: jest.fn().mockReturnValue('sk_test_secret') } as any,
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
});
