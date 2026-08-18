import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAccount } from '../auth/entities/user-account.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSubscription } from './entities/subscription.entity';
import { BillingConfig } from './entities/billing-config.entity';
import { BillingConfigService } from './billing-config.service';
import { AdminBillingController } from './admin-billing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BillingSubscription, BillingConfig, UserAccount], 'main')],
  controllers: [BillingController, AdminBillingController],
  providers: [BillingService, BillingConfigService],
  exports: [BillingService],
})
export class BillingModule {}
