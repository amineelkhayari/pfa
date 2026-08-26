import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ShopifyController } from './controllers/shopify.controller';

import { ShopifyService } from './services/shopify.service';

import { HttpModule } from '@nestjs/axios';
import { ShopifyOAuthService } from './services/shopify-oauth.service';
import { StoreModule } from '../stores/store.module';
import { CommerceCoreModule } from '../../commerce/commerce-core.module';
import { ShopifyProvider } from './services/shopify.provider';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../stores/entities/product.entity';
import { Order } from '../stores/entities/order.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopifyOAuthState } from './entities/shopify-oauth-state.entity';
import { ShopifyWebhookDelivery } from './entities/shopify-webhook-delivery.entity';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { ShopifyWebhookController } from './controllers/shopify.webhook.controller';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    CommerceCoreModule,
    StoreModule,
    MessageModule,
    TypeOrmModule.forFeature([Store, Product, Order, ShopifyOAuthState, ShopifyWebhookDelivery], 'data'),
  ],
  controllers: [ShopifyController, ShopifyWebhookController],
  providers: [
    ShopifyService,
    ShopifyOAuthService,
    ShopifyProvider,
    CredentialEncryptionService,
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
