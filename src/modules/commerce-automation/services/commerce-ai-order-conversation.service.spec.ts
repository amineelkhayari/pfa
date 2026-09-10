import { Repository } from 'typeorm';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { CommerceAiOrderConversationService } from './commerce-ai-order-conversation.service';
import { CommerceCatalogConversationService } from './commerce-catalog-conversation.service';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { CommerceVoiceService } from './commerce-voice.service';

describe('CommerceAiOrderConversationService', () => {
  const respond = jest.fn();
  const saveConversation = jest.fn((value: OrderAiConversation) => Promise.resolve(value));
  const sendReply = jest.fn();
  const apply = jest.fn();
  const service = new CommerceAiOrderConversationService(
    { respond, timeoutHours: jest.fn(() => 24), maxTurns: jest.fn(() => 8) } as unknown as CommerceAiAgentService,
    {
      products: jest.fn(() => Promise.resolve([])),
      relevant: jest.fn(() => []),
      hasUnverifiedMutationClaim: jest.fn(() => false),
    } as unknown as CommerceCatalogConversationService,
    {
      handlePendingEdit: jest.fn(() => Promise.resolve(false)),
      hasAddressChangeIntent: jest.fn(() => false),
      apply,
      confirmationMessage: jest.fn(() => Promise.resolve('confirmed')),
    } as unknown as CommerceOrderActionService,
    { sendReply } as unknown as CommerceVoiceService,
    { save: jest.fn() } as unknown as Repository<Order>,
    {
      findOneBy: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((value: Partial<OrderAiConversation>): OrderAiConversation => value as OrderAiConversation),
      save: saveConversation,
    } as unknown as Repository<OrderAiConversation>,
  );
  const store = { id: 'store-1', name: 'Store', language: 'fr' } as Store;
  const order = { id: 'order-1', confirmationStatus: 'pending', orderNumber: '#1' } as Order;

  beforeEach(() => jest.clearAllMocks());

  it('persists and sends a normal AI response', async () => {
    respond.mockResolvedValue({ action: 'continue', reply: 'Bonjour, comment puis-je aider ?' });
    await service.handle('session-1', '212600000000@c.us', store, order, 'Salam');
    expect(saveConversation).toHaveBeenCalled();
    expect(sendReply).toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies a provider mutation before reporting AI confirmation', async () => {
    respond.mockResolvedValue({ action: 'confirm', reply: 'Commande confirmée' });
    apply.mockResolvedValue(undefined);
    await service.handle('session-1', '212600000000@c.us', store, order, 'Je confirme');
    expect(apply).toHaveBeenCalledWith(store, order, 'confirm');
    expect(sendReply).toHaveBeenCalled();
  });
});
