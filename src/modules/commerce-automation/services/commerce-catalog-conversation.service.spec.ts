import { Repository } from 'typeorm';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { MessageService } from '../../message/message.service';
import { Product } from '../../stores/entities/product.entity';
import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { CommerceAiToolExecutorService } from './commerce-ai-tool-executor.service';
import { CommerceCatalogConversationService } from './commerce-catalog-conversation.service';
import { CommerceToolService } from './commerce-tool.service';
import { CommerceVoiceService } from './commerce-voice.service';

describe('CommerceCatalogConversationService', () => {
  const service = new CommerceCatalogConversationService(
    {} as CommerceAiAgentService,
    {} as CredentialEncryptionService,
    {} as MessageService,
    {} as CommerceToolService,
    {} as CommerceAiToolExecutorService,
    {} as CommerceVoiceService,
    {} as Repository<Product>,
  );

  it('distinguishes an order-history request from starting a new order', () => {
    expect(service.isGeneralOrderQuery('3tini les commandes li 3ndi')).toBe(true);
    expect(service.isGeneralOrderQuery('bghit ndir commande jdida')).toBe(false);
  });

  it('detects unverified AI claims that an order was created', () => {
    expect(service.hasUnverifiedMutationClaim('Votre commande #1025 a été créée')).toBe(true);
    expect(service.hasUnverifiedMutationClaim('Souhaitez-vous créer la commande ?')).toBe(false);
  });

  it('selects relevant products instead of sending the complete catalogue', () => {
    const products = [
      { title: 'Liquid Snowboard', productType: 'snowboard', tags: [] },
      { title: 'Logo T-Shirt', productType: 'shirt', tags: [] },
    ] as Product[];
    expect(service.relevant(products, 'Je cherche un shirt')[0]?.title).toBe('Logo T-Shirt');
  });
});
