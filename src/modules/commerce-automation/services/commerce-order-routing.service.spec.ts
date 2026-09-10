import { Repository } from 'typeorm';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { CommerceOrderRoutingService } from './commerce-order-routing.service';

describe('CommerceOrderRoutingService', () => {
  const saveOrder = jest.fn((order: Order) => Promise.resolve(order));
  const findConversation = jest.fn();
  const service = new CommerceOrderRoutingService(
    { save: saveOrder } as unknown as Repository<Order>,
    { findOne: findConversation } as unknown as Repository<OrderAiConversation>,
  );

  beforeEach(() => jest.clearAllMocks());

  it('does not treat an arbitrary product menu number as an order action', () => {
    expect(service.hasOrderActionIntent('3')).toBe(false);
    expect(service.shouldRequestOrderNumber(2, true, '3')).toBe(false);
  });

  it('requests an order number for an ambiguous confirmation action', () => {
    expect(service.shouldRequestOrderNumber(2, true, 'Je confirme')).toBe(true);
    expect(service.shouldRequestOrderNumber(2, true, '1')).toBe(true);
  });

  it('selects an explicitly referenced pending order', async () => {
    const orders = [
      { id: 'a', orderNumber: '#1013', confirmationStatus: 'pending' },
      { id: 'b', orderNumber: '#1017', confirmationStatus: 'pending' },
    ] as Order[];
    const route = await service.resolve(orders, 'Je confirme la commande 1017');
    expect(route.actionableOrder?.id).toBe('b');
  });

  it('restores an open failed confirmation before routing it', async () => {
    const order = {
      id: 'a',
      orderNumber: '#1013',
      confirmationStatus: 'failed',
      confirmationError: 'timeout',
      status: 'open',
    } as Order;
    const route = await service.resolve([order], 'commande 1013');
    expect(route.actionableOrder).toBe(order);
    expect(order.confirmationStatus).toBe('pending');
    expect(saveOrder).toHaveBeenCalledWith(order);
  });

  it('returns the latest pending address edit with its order', async () => {
    findConversation.mockResolvedValue({ orderId: 'b', pendingAction: 'confirm_shipping_address' });
    const orders = [{ id: 'a' }, { id: 'b' }] as Order[];
    const result = await service.pendingAddressEdit(orders);
    expect(result?.order.id).toBe('b');
  });
});
