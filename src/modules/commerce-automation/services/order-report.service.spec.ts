import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { OrderReportService } from './order-report.service';

describe('OrderReportService', () => {
  it('creates a valid customer order-history PDF', async () => {
    const pdf = await new OrderReportService().customerOrders(
      { name: 'Demo Store' } as Store,
      [{ orderNumber: '#10', externalOrderId: '10', status: 'confirmed', financialStatus: 'paid', fulfillmentStatus: 'shipped', lineItems: [{ title: 'Test product', quantity: 2 }], totalPrice: 42.5, currency: 'MAD' }] as Order[],
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
