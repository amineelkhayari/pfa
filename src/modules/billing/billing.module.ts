import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAccount } from '../auth/entities/user-account.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSubscription } from './entities/subscription.entity';
import { BillingConfig } from './entities/billing-config.entity';
import { BillingConfigService } from './billing-config.service';
import { AdminAiSettingsController, AdminBillingController } from './admin-billing.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { BillingPlan } from './entities/billing-plan.entity';
import { PlanCatalogService } from './plan-catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([BillingSubscription, PaymentTransaction, BillingConfig, BillingPlan, UserAccount], 'data')],
  controllers: [BillingController, AdminBillingController, AdminAiSettingsController],
  providers: [BillingService, BillingConfigService, PlanCatalogService],
  exports: [BillingService, BillingConfigService, PlanCatalogService],
})
export class BillingModule {}
