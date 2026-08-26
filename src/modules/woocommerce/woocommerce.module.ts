import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceCoreModule } from '../../commerce/commerce-core.module';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';
import { StoreModule } from '../stores/store.module';
import { MessageModule } from '../message/message.module';
import { Product } from '../stores/entities/product.entity';
import { Order } from '../stores/entities/order.entity';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { WooCommerceController } from './woocommerce.controller';
import { WooCommerceService } from './services/woocommerce.service';
import { WooCommerceProvider } from './services/woocommerce.provider';

@Module({
  imports: [CommerceCoreModule, StoreModule, MessageModule, TypeOrmModule.forFeature([Product, Order], 'data')],
  controllers: [WooCommerceController],
  providers: [
    WooCommerceService,
    WooCommerceProvider,
    CredentialEncryptionService,
    {
      provide: 'WOOCOMMERCE_PROVIDER_REGISTRATION',
      inject: [WooCommerceProvider, IntegrationProviderRegistry],
      useFactory: (provider: WooCommerceProvider, registry: IntegrationProviderRegistry) => {
        registry.register(provider);
        return true;
      },
    },
  ],
  exports: [WooCommerceService, WooCommerceProvider],
})
export class WooCommerceModule {}
