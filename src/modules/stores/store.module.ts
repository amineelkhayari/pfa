import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Store } from './entities/store.entity';

import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { MessageModule } from '../message/message.module';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { Session } from '../session/entities/session.entity';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { OrderAiConversation } from './entities/order-ai-conversation.entity';
import { Message } from '../message/entities/message.entity';

@Module({
  imports: [
    //ShopifyModule,
    MessageModule,
    TypeOrmModule.forFeature(
      [
        Store,
        Product,
        Order,
        Session,
        OrderAiConversation,
        Message,
        // IntegrationConnection
      ],
      'data',
    ),
  ],
  controllers: [StoreController],
  providers: [StoreService, CredentialEncryptionService],
  exports: [StoreService],
})
export class StoreModule {}
