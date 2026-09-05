import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceCoreModule } from '../../commerce/commerce-core.module';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { MessageModule } from '../message/message.module';
import { Order } from '../stores/entities/order.entity';
import { Product } from '../stores/entities/product.entity';
import { StoreModule } from '../stores/store.module';
import { YouCanOAuthState } from './entities/youcan-oauth-state.entity';
import { YouCanOAuthService } from './services/youcan-oauth.service';
import { YouCanProvider } from './services/youcan.provider';
import { YouCanService } from './services/youcan.service';
import { YouCanController } from './youcan.controller';

@Module({ imports: [CommerceCoreModule, StoreModule, MessageModule, TypeOrmModule.forFeature([Product, Order, YouCanOAuthState], 'data')], controllers: [YouCanController], providers: [YouCanService, YouCanOAuthService, YouCanProvider, CredentialEncryptionService, { provide: 'YOUCAN_PROVIDER_REGISTRATION', inject: [YouCanProvider, IntegrationProviderRegistry], useFactory: (provider: YouCanProvider, registry: IntegrationProviderRegistry) => { registry.register(provider); return true; } }], exports: [YouCanService, YouCanProvider] })
export class YouCanModule {}
