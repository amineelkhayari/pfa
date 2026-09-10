import { Repository } from 'typeorm';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { CommerceAiToolExecutorService } from './commerce-ai-tool-executor.service';
import { CommerceCartConversationService } from './commerce-cart-conversation.service';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { CommerceToolService } from './commerce-tool.service';

describe('CommerceAiToolExecutorService', () => {
  const getStoreKnowledge = jest.fn();
  const service = new CommerceAiToolExecutorService(
    { get: jest.fn(() => ({ getStoreKnowledge })) } as unknown as IntegrationProviderRegistry,
    { revealSettings: jest.fn(() => ({ token: 'secret' })) } as unknown as CredentialEncryptionService,
    { stock: jest.fn(), searchProducts: jest.fn() } as unknown as CommerceToolService,
    {} as CommerceCartConversationService,
    {} as CommerceOrderActionService,
    {} as Repository<OrderAiConversation>,
  );
  const store = { id: 'store-1', provider: 'shopify', currency: 'MAD', settings: {} } as Store;

  beforeEach(() => jest.clearAllMocks());

  it('returns only a real customer order matching the requested number', async () => {
    const orders = [{ orderNumber: '#1025', status: 'open', totalPrice: 100, currency: 'MAD' }] as Order[];
    await expect(
      service.execute('get_order_details', { order_number: '1025' }, store, '212600000000', [], orders, ''),
    ).resolves.toEqual(expect.objectContaining({ order_number: '#1025', total: 100 }));
  });

  it('loads verified store knowledge through the selected provider', async () => {
    getStoreKnowledge.mockResolvedValue({ shipping: { zones: [] }, payments: ['cash'] });
    await expect(
      service.execute('get_store_information', {}, store, '212600000000', [], [], 'shipping'),
    ).resolves.toEqual(expect.objectContaining({ provider: 'shopify', payments: ['cash'] }));
    expect(getStoreKnowledge).toHaveBeenCalled();
  });
});
