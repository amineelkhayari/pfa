import { PlanUsageService } from './plan-usage.service';
import { UserAuthService } from './user-auth.service';
import { UserAccount, UserPlan } from './entities/user-account.entity';
import { ApiKeyRole } from './entities/api-key.entity';

describe('Trial Extension and Extra Quotas', () => {
  describe('PlanUsageService extra quota and trial override', () => {
    const createUsageService = (planLimits: any) =>
      new PlanUsageService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          get: () => ({
            priceMonthly: 0,
            trialDays: 1,
            limits: planLimits,
            capabilities: {},
          }),
        } as never,
      ) as any;

    it('calculates effective limits including extraQuota for sessions and stores', () => {
      const service = createUsageService({
        sessions: 5,
        stores: 5,
        sentMessages: 1250,
        receivedMessages: 1250,
        aiTokens: 100000,
      });

      const user = {
        plan: UserPlan.PRO,
        settings: {
          extraQuota: {
            sessions: 1,
            stores: 2,
            sentMessages: 1000,
            receivedMessages: 1000,
            aiTokens: 50000,
          },
        },
      } as unknown as UserAccount;

      const limits = service.limitsFor(user);
      expect(limits.sessions).toBe(6);
      expect(limits.stores).toBe(7);
      expect(limits.sentMessages).toBe(2250);
      expect(limits.receivedMessages).toBe(2250);
      expect(limits.aiTokens).toBe(150000);
    });

    it('overrides expired free trial with custom trialEndsAt in user.settings', () => {
      const service = createUsageService({ sessions: 1, stores: 1 });
      const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString();

      const user = {
        plan: UserPlan.FREE,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        settings: {
          trialEndsAt: futureDate,
        },
      } as unknown as UserAccount;

      expect(service.isTrialExpired(user)).toBe(false);
      expect(service.trialEndsAt(user)).toEqual(new Date(futureDate));
    });

    it('identifies expired trial if extended trial date is in the past', () => {
      const service = createUsageService({ sessions: 1, stores: 1 });
      const pastDate = new Date(Date.now() - 3600_000).toISOString();

      const user = {
        plan: UserPlan.FREE,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        settings: {
          trialEndsAt: pastDate,
        },
      } as unknown as UserAccount;

      expect(service.isTrialExpired(user)).toBe(true);
    });
  });

  describe('UserAuthService adminExtendTrial and adminSetExtraQuota', () => {
    let mockUser: any;
    let savedUser: any;
    let authService: any;

    beforeEach(() => {
      mockUser = {
        id: 'usr-123',
        name: 'Test Merchant',
        email: 'merchant@test.local',
        username: 'merchant',
        role: ApiKeyRole.OPERATOR,
        plan: UserPlan.FREE,
        status: 'active',
        settings: {},
        sentMessages: 20,
        receivedMessages: 15,
        aiTokensUsed: 4900,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      };
      savedUser = null;

      const usersRepo = {
        findOneBy: jest.fn().mockImplementation(() => Promise.resolve(mockUser)),
        findOneByOrFail: jest.fn().mockImplementation(() => Promise.resolve(savedUser || mockUser)),
        save: jest.fn().mockImplementation((u) => {
          savedUser = { ...u };
          return Promise.resolve(savedUser);
        }),
      };

      authService = new UserAuthService(
        usersRepo as never,
        {} as never,
        {
          get: () => ({ priceMonthly: 0, trialDays: 1, limits: {} }),
          require: () => ({ priceMonthly: 0, trialDays: 1, limits: {} }),
        } as never,
      );
    });

    it('extends trial by 3 days and resets usage counters', async () => {
      const result = await authService.adminExtendTrial('usr-123', {
        extendDays: 3,
        resetUsage: true,
      });

      expect(result.success).toBe(true);
      expect(result.trialEndsAt).toBeDefined();
      const newExpiry = new Date(result.trialEndsAt);
      expect(newExpiry.getTime()).toBeGreaterThan(Date.now());

      // Usage counters should be reset
      expect(savedUser.sentMessages).toBe(0);
      expect(savedUser.receivedMessages).toBe(0);
      expect(savedUser.aiTokensUsed).toBe(0);
      expect(savedUser.settings.trialEndsAt).toBe(result.trialEndsAt);
    });

    it('sets specific custom trial expiration date', async () => {
      const specificDate = new Date('2026-12-31T23:59:59.000Z');
      const result = await authService.adminExtendTrial('usr-123', {
        action: 'set_date',
        trialEndsAt: specificDate.toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.trialEndsAt).toBe(specificDate.toISOString());
      expect(savedUser.settings.trialEndsAt).toBe(specificDate.toISOString());
    });

    it('sets extra quotas for sessions, stores, messages, and tokens', async () => {
      const result = await authService.adminSetExtraQuota('usr-123', {
        sessions: 2,
        stores: 1,
        sentMessages: 5000,
        receivedMessages: 5000,
        aiTokens: 100000,
      });

      expect(result.success).toBe(true);
      expect(result.extraQuota).toEqual({
        sessions: 2,
        stores: 1,
        sentMessages: 5000,
        receivedMessages: 5000,
        aiTokens: 100000,
      });
      expect(savedUser.settings.extraQuota).toEqual(result.extraQuota);
    });
  });
});
