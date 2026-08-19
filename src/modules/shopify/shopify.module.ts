import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ShopifyController } from './controllers/shopify.controller';

import { ShopifyService } from './services/shopify.service';

import { HttpModule } from '@nestjs/axios';
import { ShopifyOAuthService } from './services/shopify-oauth.service';
import { StoreModule } from '../stores/store.module';
import { EngineEcomModule } from '../../ecomEngine/engin.ecom.module';
import { ShopifyProvider } from './services/shopify.provider';
import { IntegrationProviderRegistry } from '../../ecomEngine/registry/integration-provider.registry';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../stores/entities/product.entity';
import { Order } from '../stores/entities/order.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopifyOAuthState } from './entities/shopify-oauth-state.entity';
import { ShopifyWebhookDelivery } from './entities/shopify-webhook-delivery.entity';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { MessageModule } from '../message/message.module';
import { ShopifyWebhookController } from './controllers/shopify.webhook.controller';
import { ShopifyOrderReplyService } from './services/shopify-order-reply.service';
import { OrderAiConversation } from './entities/order-ai-conversation.entity';
import { OpenAiOrderAgentService } from './services/openai-order-agent.service';
import { BillingModule } from '../billing/billing.module';
import { AdminAiTestController, UserAiTestController } from './controllers/admin-ai-test.controller';
import { StoreOrderCart } from './entities/store-order-cart.entity';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    EngineEcomModule,
    StoreModule,
    MessageModule,
    BillingModule,
    TypeOrmModule.forFeature([Store, Product, Order, ShopifyOAuthState, ShopifyWebhookDelivery, OrderAiConversation, StoreOrderCart], 'data'),
  ],
  controllers: [ShopifyController, ShopifyWebhookController, AdminAiTestController, UserAiTestController],
  providers: [
    ShopifyService,
    ShopifyOAuthService,
    ShopifyProvider,
    CredentialEncryptionService,
    ShopifyOrderReplyService,
    OpenAiOrderAgentService,
    {
      provide: 'SHOPIFY_PROVIDER_REGISTRATION',
      inject: [ShopifyProvider, IntegrationProviderRegistry],
      useFactory: (shopifyProvider: ShopifyProvider, registry: IntegrationProviderRegistry) => {
        registry.register(shopifyProvider);
        return true;
      },
    },
  ],
  exports: [ShopifyService, ShopifyProvider, ShopifyOAuthService],
})
export class ShopifyModule {}
