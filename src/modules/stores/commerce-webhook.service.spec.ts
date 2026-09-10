import { CommerceWebhookService } from './commerce-webhook.service';
import { Order } from './entities/order.entity';
import { StoreService } from './store.service';

describe('CommerceWebhookService', () => {
  let savedSettings: Record<string, unknown> | undefined;
  const updateIntegrationCredentials = jest.fn(
    (_storeId: string, _provider: string, settings: Record<string, unknown>): Promise<void> => {
      savedSettings = settings;
      return Promise.resolve();
    },
  );
  const service = new CommerceWebhookService({ updateIntegrationCredentials } as unknown as StoreService);

  beforeEach(() => jest.clearAllMocks());

  const order = (values: Partial<Order>): Order => values as Order;

  it('records provider webhook activity without discarding settings', async () => {
    await service.recordActivity('store-1', 'shopify', { accessToken: 'token' }, 'orders/updated');

    expect(updateIntegrationCredentials).toHaveBeenCalledWith(
      'store-1',
      'shopify',
      expect.objectContaining({
        accessToken: 'token',
        lastWebhookEvent: 'orders/updated',
      }),
    );
    expect(typeof savedSettings?.lastWebhookAt).toBe('string');
  });

  it('detects payment, partial fulfillment, shipping, and cancellation transitions', () => {
    expect(
      service.detectOrderEvents(order({ financialStatus: 'pending' }), order({ financialStatus: 'paid' })),
    ).toEqual(['paid']);
    expect(
      service.detectOrderEvents(
        order({ fulfillmentStatus: null }),
        order({ fulfillmentStatus: 'partially_fulfilled' }),
      ),
    ).toEqual(['partiallyFulfilled']);
    expect(
      service.detectOrderEvents(order({ fulfillmentStatus: 'partial' }), order({ fulfillmentStatus: 'fulfilled' })),
    ).toEqual(['shipped']);
    expect(service.detectOrderEvents(order({ status: 'open' }), order({ status: 'cancelled_by_seller' }))).toEqual([
      'cancelled',
    ]);
  });

  it('does not emit an event when the normalized state did not change', () => {
    expect(
      service.detectOrderEvents(
        order({ financialStatus: 'paid', fulfillmentStatus: 'delivered', status: 'cancelled' }),
        order({ financialStatus: 'paid', fulfillmentStatus: 'completed', status: 'canceled' }),
      ),
    ).toEqual([]);
  });

  it('uses provider event hints when the payload does not expose a normalized status', () => {
    expect(service.detectOrderEvents(undefined, order({}), 'order.paid')).toEqual(['paid']);
    expect(service.detectOrderEvents(undefined, order({}), 'order.cancelled')).toEqual(['cancelled']);
  });
});
