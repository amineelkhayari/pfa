import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { BillingModule } from '../billing/billing.module';
import { MessageModule } from '../message/message.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { YouCanModule } from '../youcan/youcan.module';
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
import { CommerceCoreModule } from '../../commerce/commerce-core.module';
import { CommerceVoiceService } from './services/commerce-voice.service';
import { CommerceCartConversationService } from './services/commerce-cart-conversation.service';
import { CommerceOrderActionService } from './services/commerce-order-action.service';
import { CommerceAiToolExecutorService } from './services/commerce-ai-tool-executor.service';
import { CommerceCatalogConversationService } from './services/commerce-catalog-conversation.service';
import { CommerceAiOrderConversationService } from './services/commerce-ai-order-conversation.service';
import { CommerceOrderRoutingService } from './services/commerce-order-routing.service';
import { CommerceMessageIdempotencyService } from './services/commerce-message-idempotency.service';
import { CommerceMessageReceipt } from '../stores/entities/commerce-message-receipt.entity';
import { CommerceToolExecution } from '../stores/entities/commerce-tool-execution.entity';
import { CommerceExecutionLogService } from './services/commerce-execution-log.service';
import { AdminCommerceExecutionsController } from './controllers/admin-commerce-executions.controller';

/** Provider-neutral customer conversation and order automation. */
@Module({
  imports: [
    CommerceCoreModule,
    ShopifyModule,
    WooCommerceModule,
    YouCanModule,
    MessageModule,
    BillingModule,
    StoreModule,
    TypeOrmModule.forFeature(
      [Store, Product, Order, OrderAiConversation, StoreOrderCart, CommerceMessageReceipt, CommerceToolExecution],
      'data',
    ),
  ],
  controllers: [AdminAiTestController, UserAiTestController, AdminCommerceExecutionsController],
  providers: [
    CommerceConversationService,
    CommerceAiAgentService,
    CommerceToolService,
    CommerceCartConversationService,
    CommerceOrderActionService,
    CommerceAiToolExecutorService,
    CommerceCatalogConversationService,
    CommerceAiOrderConversationService,
    CommerceOrderRoutingService,
    CommerceMessageIdempotencyService,
    CommerceExecutionLogService,
    CommerceVoiceService,
    AudioTranscriptionService,
    CredentialEncryptionService,
  ],
  exports: [CommerceConversationService, CommerceAiAgentService, CommerceToolService],
})
export class CommerceAutomationModule {}
