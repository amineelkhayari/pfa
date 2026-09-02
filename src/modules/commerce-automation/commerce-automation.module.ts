import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { BillingModule } from '../billing/billing.module';
import { MessageModule } from '../message/message.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { Order } from '../stores/entities/order.entity';
import { Product } from '../stores/entities/product.entity';
import { Store } from '../stores/entities/store.entity';
import { OrderAiConversation } from '../stores/entities/order-ai-conversation.entity';
import { StoreOrderCart } from '../stores/entities/store-order-cart.entity';
import { StoreModule } from '../stores/store.module';
import { AdminAiTestController, UserAiTestController } from './controllers/commerce-ai-test.controller';
import { CommerceAiAgentService } from './services/commerce-ai-agent.service';
import { CommerceConversationService } from './services/commerce-conversation.service';
import { CommerceToolService } from './services/commerce-tool.service';
import { AudioTranscriptionService } from './services/audio-transcription.service';

/** Provider-neutral customer conversation and order automation. */
@Module({
  imports: [
    ShopifyModule,
    WooCommerceModule,
    MessageModule,
    BillingModule,
    StoreModule,
    TypeOrmModule.forFeature([Store, Product, Order, OrderAiConversation, StoreOrderCart], 'data'),
  ],
  controllers: [AdminAiTestController, UserAiTestController],
  providers: [CommerceConversationService, CommerceAiAgentService, CommerceToolService, AudioTranscriptionService, CredentialEncryptionService],
  exports: [CommerceConversationService, CommerceAiAgentService, CommerceToolService],
})
export class CommerceAutomationModule {}
