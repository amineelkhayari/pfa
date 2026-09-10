import { Repository } from 'typeorm';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { Product } from '../../stores/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { CommerceVoiceService } from './commerce-voice.service';

describe('CommerceOrderActionService', () => {
  const confirmOrder = jest.fn();
  const cancelOrder = jest.fn();
  const updateShippingAddress = jest.fn();
  const saveOrder = jest.fn((order: Order) => Promise.resolve(order));
  const service = new CommerceOrderActionService(
    {
      get: jest.fn(() => ({ confirmOrder, cancelOrder, updateShippingAddress })),
    } as unknown as IntegrationProviderRegistry,
    { revealSettings: jest.fn(() => ({ token: 'secret' })) } as unknown as CredentialEncryptionService,
    { sendReply: jest.fn() } as unknown as CommerceVoiceService,
    { save: saveOrder } as unknown as Repository<Order>,
    { find: jest.fn(() => Promise.resolve([])) } as unknown as Repository<Product>,
    { save: jest.fn() } as unknown as Repository<OrderAiConversation>,
  );
  const store = { id: 'store-1', provider: Platform.SHOPIFY, settings: {} } as Store;

  beforeEach(() => jest.clearAllMocks());

  it('confirms the provider before marking the local order confirmed', async () => {
    const order = { id: 'order-1', confirmationStatus: 'pending', status: 'open' } as Order;
    confirmOrder.mockResolvedValue(undefined);

    await service.apply(store, order, 'confirm');

    expect(confirmOrder).toHaveBeenCalled();
    expect(order.confirmationStatus).toBe('confirmed');
    expect(order.status).toBe('confirmed');
  });

  it('restores pending status when a provider mutation fails', async () => {
    const order = { id: 'order-1', confirmationStatus: 'pending', status: 'open' } as Order;
    confirmOrder.mockRejectedValue(new Error('provider unavailable'));

    await expect(service.apply(store, order, 'confirm')).rejects.toThrow('provider unavailable');
    expect(order.confirmationStatus).toBe('pending');
    expect(order.confirmationError).toBe('provider unavailable');
  });

  it('recognizes explicit multilingual confirmation and cancellation only', () => {
    expect(service.directAction('1')).toBe('confirm');
    expect(service.directAction('CONFIRMER')).toBe('confirm');
    expect(service.directAction('إلغاء')).toBe('cancel');
    expect(service.directAction('Salam')).toBeNull();
  });
});
