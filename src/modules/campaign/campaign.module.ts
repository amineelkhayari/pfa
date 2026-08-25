import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageModule } from '../message/message.module';
import { MessageBatch } from '../message/entities/message-batch.entity';
import { Message } from '../message/entities/message.entity';
import { Session } from '../session/entities/session.entity';
import { Order } from '../stores/entities/order.entity';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { Campaign } from './entities/campaign.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Campaign, Session, Order, MessageBatch, Message], 'data'), MessageModule],
  controllers: [CampaignController],
  providers: [CampaignService],
})
export class CampaignModule {}
