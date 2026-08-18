import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ApiKey } from './entities/api-key.entity';
import { AuthService } from './auth.service';
import { ApiKeyUsageTracker } from './api-key-usage-tracker.service';
import { AuthController } from './auth.controller';
import { AuthValidateController } from './auth-validate.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ProxyAwareThrottlerGuard } from '../../common/security/proxy-aware-throttler.guard';
import { UserAccount } from './entities/user-account.entity';
import { UserLoginSession } from './entities/user-login-session.entity';
import { UserAuthService } from './user-auth.service';
import { UserAuthController } from './user-auth.controller';
import { Session } from '../session/entities/session.entity';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../stores/entities/product.entity';
import { Order } from '../stores/entities/order.entity';
import { PlanUsageService } from './plan-usage.service';
import { AdminUsersController } from './admin-users.controller';
import { BillingSubscription } from '../billing/entities/subscription.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, UserAccount, UserLoginSession, BillingSubscription], 'main'),
    TypeOrmModule.forFeature([Session, Store, Product, Order], 'data'),
  ],
  controllers: [AuthController, AuthValidateController, UserAuthController, AdminUsersController],
  providers: [
    AuthService,
    UserAuthService,
    PlanUsageService,
    ApiKeyUsageTracker,
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
  exports: [AuthService, UserAuthService, PlanUsageService],
})
export class AuthModule {}
