import { StoreService } from './store.service';

describe('StoreService getStoreReport', () => {
  it('aggregates revenue, orders, and daily evolution accurately', async () => {
    const mockStore = {
      id: 'store-123',
      name: 'Test Store',
      provider: 'youcan',
      currency: 'MAD',
      settings: {},
    };

    const mockOrders = [
      {
        id: 'ord-1',
        totalPrice: '150.00',
        currency: 'MAD',
        status: 'confirmed',
        confirmationStatus: 'confirmed',
        financialStatus: 'paid',
        fulfillmentStatus: 'unfulfilled',
        externalCreatedAt: new Date('2026-09-20T10:00:00Z'),
      },
      {
        id: 'ord-2',
        totalPrice: '250.00',
        currency: 'MAD',
        status: 'closed',
        confirmationStatus: 'not_sent',
        financialStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
        externalCreatedAt: new Date('2026-09-20T14:00:00Z'),
      },
      {
        id: 'ord-3',
        totalPrice: '100.00',
        currency: 'MAD',
        status: 'cancelled',
        confirmationStatus: 'cancelled',
        financialStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        externalCreatedAt: new Date('2026-09-21T12:00:00Z'),
      },
    ];

    const storeRepo = {
      findOne: jest.fn().mockResolvedValue(mockStore),
      findOneBy: jest.fn().mockResolvedValue(mockStore),
    };
    const productRepo = {
      count: jest.fn().mockResolvedValue(15),
    };
    const orderRepo = {
      find: jest.fn().mockResolvedValue(mockOrders),
    };

    const service = new StoreService(
      storeRepo as any,
      {} as any,
      productRepo as any,
      orderRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const report = await service.getStoreReport('store-123', 30);

    expect(report.store.name).toBe('Test Store');
    expect(report.summary.totalRevenue).toBe(500);
    expect(report.summary.totalOrders).toBe(3);
    expect(report.summary.totalProducts).toBe(15);
    expect(report.summary.averageOrderValue).toBe(166.67);
    expect(report.summary.confirmedOrders).toBe(1);
    expect(report.summary.confirmationRate).toBe(33);

    expect(report.statusBreakdown.confirmed).toBe(1);
    expect(report.statusBreakdown.fulfilled).toBe(1);
    expect(report.statusBreakdown.cancelled).toBe(1);

    expect(report.evolution.length).toBe(2);
    // Sep 20: 2 orders, 400 MAD
    expect(report.evolution[0].date).toBe('2026-09-20');
    expect(report.evolution[0].orders).toBe(2);
    expect(report.evolution[0].revenue).toBe(400);
    expect(report.evolution[0].confirmed).toBe(1);
    expect(report.evolution[0].fulfilled).toBe(1);
  });
});
