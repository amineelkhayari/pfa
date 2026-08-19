import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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

class UpdateAiSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(['openai', 'openrouter', 'gemini', 'custom']) provider?: 'openai' | 'openrouter' | 'gemini' | 'custom';
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(2) @Max(50) maxTurns?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) conversationTimeoutHours?: number;
}

@Controller('admin/ai-settings')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminAiSettingsController {
  constructor(private readonly config: BillingConfigService) {}
  @Get() get() { return this.config.viewAi(); }
  @Put() update(@Body() dto: UpdateAiSettingsDto) { return this.config.updateAi(dto); }
}
