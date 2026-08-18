import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { BillingConfigService, PaymentSettings } from './billing-config.service';

class UpdatePaymentSettingsDto implements PaymentSettings {
  @IsOptional() @IsString() publicAppUrl?: string;
  @IsOptional() @IsBoolean() stripeEnabled?: boolean;
  @IsOptional() @IsString() stripeSecretKey?: string;
  @IsOptional() @IsString() stripePriceId?: string;
  @IsOptional() @IsString() stripeWebhookSecret?: string;
  @IsOptional() @IsBoolean() paypalEnabled?: boolean;
  @IsOptional() @IsIn(['sandbox', 'live']) paypalEnvironment?: 'sandbox' | 'live';
  @IsOptional() @IsString() paypalClientId?: string;
  @IsOptional() @IsString() paypalClientSecret?: string;
  @IsOptional() @IsString() paypalPlanId?: string;
  @IsOptional() @IsString() paypalWebhookId?: string;
}

@Controller('admin/billing-settings')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminBillingController {
  constructor(private readonly config: BillingConfigService) {}
  @Get() get() { return this.config.view(); }
  @Put() update(@Body() dto: UpdatePaymentSettingsDto) { return this.config.update(dto); }
}
