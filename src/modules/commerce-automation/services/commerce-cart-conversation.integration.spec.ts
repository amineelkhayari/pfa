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

describe('CommerceCartConversationService flow', () => {
  let activeCart: StoreOrderCart | null;
  const createOrder = jest.fn<Promise<{ orderId: string; orderName: string }>, [unknown, unknown]>();
  const sendReply = jest.fn<Promise<{ messageId: string }>, [string, { chatId: string; text: string }]>();
  const executionLog = {
    start: jest.fn(() => Promise.resolve({ id: 'execution-1', createdAt: new Date() } as CommerceToolExecution)),
    succeed: jest.fn(),
    fail: jest.fn(),
  };
  const cartRepository = {
    findOneBy: jest.fn(() => Promise.resolve(activeCart)),
    create: jest.fn((value: Partial<StoreOrderCart>) => value as StoreOrderCart),
    save: jest.fn((value: StoreOrderCart) => {
      value.id ||= 'cart-1';
      activeCart = value;
      return Promise.resolve(value);
    }),
    update: jest.fn((criteria: { id: string; step: string }, changes: Partial<StoreOrderCart>) => {
      if (!activeCart || activeCart.id !== criteria.id || activeCart.step !== criteria.step)
        return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
      Object.assign(activeCart, changes);
      return Promise.resolve({ affected: 1, raw: [], generatedMaps: [] });
    }),
    delete: jest.fn(() => {
      activeCart = null;
      return Promise.resolve({ affected: 1, raw: [] });
    }),
  };
  const service = new CommerceCartConversationService(
    { get: jest.fn(() => ({ createOrder })) } as unknown as IntegrationProviderRegistry,
    { revealSettings: jest.fn(() => ({ accessToken: 'secret' })) } as unknown as CredentialEncryptionService,
    { getMessages: jest.fn() } as unknown as MessageService,
    { sendReply } as unknown as CommerceVoiceService,
    executionLog as unknown as CommerceExecutionLogService,
    cartRepository as unknown as Repository<StoreOrderCart>,
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
    price: 885.95,
    variants: [{ id: '11', title: 'Default Title', price: 885.95 }],
  } as unknown as Product;
  const input = (text: string) => ({
    sessionId: 'session-1',
    chatId: '212600000000@c.us',
    store,
    text,
    phone: '212600000000',
    products: [product],
  });

  beforeEach(() => {
    activeCart = null;
    jest.clearAllMocks();
    createOrder.mockResolvedValue({ orderId: 'external-1', orderName: '#1025' });
    sendReply.mockResolvedValue({ messageId: 'message-1' });
  });

  it('completes product selection, delivery collection and provider order creation', async () => {
    await expect(service.handle(input('Salam'))).resolves.toBe('not_handled');
    await expect(service.handle(input('Je veux acheter The Snowboard'))).resolves.toBe('handled');
    expect(activeCart).toEqual(expect.objectContaining({ step: 'quantity', productId: product.id }));

    await service.handle(input('1'));
    expect(activeCart).toEqual(expect.objectContaining({ step: 'name', quantity: 1 }));
    await service.handle(input('Amine Alaoui'));
    expect(activeCart).toEqual(expect.objectContaining({ step: 'address', customerName: 'Amine Alaoui' }));
    await service.handle(input('Street 15'));
    expect(activeCart).toEqual(expect.objectContaining({ step: 'city', address1: 'Street 15' }));
    await service.handle(input('Rabat'));
    expect(activeCart).toEqual(expect.objectContaining({ step: 'confirm', city: 'Rabat' }));
    expect(createOrder).not.toHaveBeenCalled();

    await service.handle(input('CONFIRMER'));
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith(
      { storeId: store.id, credentials: { accessToken: 'secret' } },
      expect.objectContaining({
        productId: product.externalProductId,
        variantId: 'gid://shopify/ProductVariant/11',
        quantity: 1,
        customerName: 'Amine Alaoui',
        address1: 'Street 15',
        city: 'Rabat',
      }),
    );
    expect(activeCart).toBeNull();
    const latestReply = sendReply.mock.calls.at(-1);
    expect(latestReply?.[0]).toBe('session-1');
    expect(latestReply?.[1].text).toContain('#1025');
  });

  it('does not create a duplicate order when confirmation is delivered twice', async () => {
    activeCart = {
      id: 'cart-1',
      storeId: store.id,
      phone: '212600000000',
      step: 'confirm',
      productId: product.id,
      variantId: 'gid://shopify/ProductVariant/11',
      variantTitle: 'Default Title',
      quantity: 1,
      customerName: 'Amine Alaoui',
      address1: 'Street 15',
      city: 'Rabat',
      country: 'Morocco',
    } as StoreOrderCart;

    await expect(service.handle(input('CONFIRMER'))).resolves.toBe('handled');
    await expect(service.handle(input('CONFIRMER'))).resolves.toBe('not_handled');
    expect(createOrder).toHaveBeenCalledTimes(1);
  });
});
