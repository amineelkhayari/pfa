import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { UserAccount } from '../auth/entities/user-account.entity';
import { Session } from '../session/entities/session.entity';
import { BillingSubscription } from '../billing/entities/subscription.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead, UserAccount, Session, BillingSubscription], 'data'),
  ],
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
