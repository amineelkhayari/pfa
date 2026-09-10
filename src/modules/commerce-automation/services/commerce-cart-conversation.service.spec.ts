import { Repository } from 'typeorm';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { MessageService } from '../../message/message.service';
import { Product } from '../../stores/entities/product.entity';
import { StoreOrderCart } from '../../stores/entities/store-order-cart.entity';
import { Store } from '../../stores/entities/store.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { CommerceCartConversationService } from './commerce-cart-conversation.service';
import { CommerceVoiceService } from './commerce-voice.service';
import { CommerceExecutionLogService } from './commerce-execution-log.service';
import { CommerceToolExecution } from '../../stores/entities/commerce-tool-execution.entity';

describe('CommerceCartConversationService', () => {
  const findOneBy = jest.fn();
  const create = jest.fn((value: Partial<StoreOrderCart>) => value as StoreOrderCart);
  const save = jest.fn((value: StoreOrderCart) => Promise.resolve(value));
  const removeCart = jest.fn();
  const updateCart = jest.fn(() => Promise.resolve({ affected: 1, raw: [], generatedMaps: [] }));
  const createOrder = jest.fn();
  const sendReply = jest.fn();
  const execution = { id: 'execution-1', createdAt: new Date() } as CommerceToolExecution;
  const executionLog = {
    start: jest.fn(() => Promise.resolve(execution)),
    succeed: jest.fn(),
    fail: jest.fn(),
  };
  const service = new CommerceCartConversationService(
    { get: jest.fn(() => ({ createOrder })) } as unknown as IntegrationProviderRegistry,
    { revealSettings: jest.fn(() => ({ accessToken: 'secret' })) } as unknown as CredentialEncryptionService,
    { getMessages: jest.fn() } as unknown as MessageService,
    { sendReply } as unknown as CommerceVoiceService,
    executionLog as unknown as CommerceExecutionLogService,
    { findOneBy, create, save, update: updateCart, delete: removeCart } as unknown as Repository<StoreOrderCart>,
  );
  const store = {
    id: 'store-1',
    provider: Platform.SHOPIFY,
    currency: 'MAD',
    settings: {},
  } as Store;
  const product = {
    id: 'product-1',
    externalProductId: 'gid://shopify/Product/1',
    title: 'The Snowboard',
    price: 100,
    variants: [{ id: '11', title: 'Default Title', price: 100 }],
  } as unknown as Product;

  beforeEach(() => jest.clearAllMocks());

  it('does not start a cart for a message without purchase intent', async () => {
    findOneBy.mockResolvedValue(null);
    await expect(
      service.handle({
        sessionId: 'session-1',
        chatId: '212600000000@c.us',
        store,
        text: 'Salam',
        phone: '212600000000',
        products: [product],
      }),
    ).resolves.toBe('not_handled');
    expect(save).not.toHaveBeenCalled();
  });

  it('persists product selection and asks for quantity', async () => {
    findOneBy.mockResolvedValue(null);
    sendReply.mockResolvedValue({ messageId: 'message-1' });

    await expect(
      service.handle({
        sessionId: 'session-1',
        chatId: '212600000000@c.us',
        store,
        text: 'Je veux acheter The Snowboard',
        phone: '212600000000',
        products: [product],
      }),
    ).resolves.toBe('handled');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'product-1', step: 'quantity', quantity: 1 }),
    );
    expect(sendReply).toHaveBeenCalled();
  });

  it('creates the provider order only after explicit confirmation', async () => {
    findOneBy.mockResolvedValue({
      id: 'cart-1',
      storeId: store.id,
      phone: '212600000000',
      step: 'confirm',
      productId: product.id,
      variantId: 'gid://shopify/ProductVariant/11',
      variantTitle: 'Default Title',
      quantity: 1,
      customerName: 'Amine',
      address1: 'Street 15',
      city: 'Rabat',
      country: 'Morocco',
    });
    createOrder.mockResolvedValue({ orderId: 'external-1', orderName: '#1025' });
    sendReply.mockResolvedValue({ messageId: 'message-1' });

    await service.handle({
      sessionId: 'session-1',
      chatId: '212600000000@c.us',
      store,
      text: 'CONFIRMER',
      phone: '212600000000',
      products: [product],
    });

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: store.id }),
      expect.objectContaining({ productId: product.externalProductId, quantity: 1, city: 'Rabat' }),
    );
    expect(removeCart).toHaveBeenCalledWith('cart-1');
    expect(sendReply).toHaveBeenCalled();
  });
});
