import { PlanUsageService } from './plan-usage.service';
import { UserPlan } from './entities/user-account.entity';

describe('PlanUsageService paid plan trial enforcement', () => {
  const serviceFor = (priceMonthly: number, trialDays: number) => new PlanUsageService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    { get: () => ({ priceMonthly, trialDays, limits: {}, capabilities: {} }) } as never,
  );

  it('does not apply the local account-age trial to a paid plan', () => {
    const service = serviceFor(500, 5) as any;
    const oldPaidUser = { plan: UserPlan.PRO, createdAt: new Date('2020-01-01T00:00:00Z') };
    expect(service.trialEndsAt(oldPaidUser)).toBeNull();
    expect(service.isTrialExpired(oldPaidUser)).toBe(false);
  });

  it('still expires a one-time free trial', () => {
    const service = serviceFor(0, 5) as any;
    const oldFreeUser = { plan: UserPlan.FREE, createdAt: new Date('2020-01-01T00:00:00Z') };
    expect(service.isTrialExpired(oldFreeUser)).toBe(true);
  });
});
