import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Put } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { BillingConfigService, PaymentSettings } from './billing-config.service';
import { BillingService } from './billing.service';
import { PlanCatalogService } from './plan-catalog.service';

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
  @IsOptional() @IsInt() @Min(1) @Max(365) freeTrialDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) freeSessionLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) freeStoreLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) freeSentMessageLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) freeReceivedMessageLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000000) freeAiTokenLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000000) proAiTokenLimit?: number;
}

class AdminCancelSubscriptionDto {
  @IsOptional() @IsBoolean() immediate?: boolean;
  @IsOptional() @IsString() reason?: string;
}

class RefundPaymentDto {
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsString() reason?: string;
}

class SavePlanDto {
  @IsString() slug: string; @IsString() name: string; @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) priceMonthly: number; @IsString() currency: string; @IsObject() limits: Record<string, number>;
  @IsArray() @IsString({ each: true }) features: string[]; @IsInt() @Min(0) @Max(365) trialDays: number;
  @IsBoolean() active: boolean; @IsBoolean() highlighted: boolean; @IsInt() sortOrder: number;
  @IsOptional() @IsString() stripePriceId?: string; @IsOptional() @IsString() paypalPlanId?: string;
}

@Controller('admin/billing-settings')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminBillingController {
  constructor(private readonly config: BillingConfigService, private readonly billing: BillingService, private readonly plans: PlanCatalogService) {}
  @Get() get() { return this.config.view(); }
  @Put() update(@Body() dto: UpdatePaymentSettingsDto) { return this.config.update(dto); }
  @Get('history') history(@Query() query: Record<string, string>) { return this.billing.adminHistory(query as any); }
  @Get('subscriptions') subscriptions(@Query() query: Record<string, string>) { return this.billing.listSubscriptions(query as any); }
  @Post('subscriptions/:id/cancel') cancelSubscription(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminCancelSubscriptionDto) { return this.billing.cancelSubscription(id, undefined, dto.immediate, dto.reason); }
  @Post('subscriptions/:id/reactivate') reactivateSubscription(@Param('id', ParseUUIDPipe) id: string) { return this.billing.reactivateSubscription(id); }
  @Post('payments/:id/refund') refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundPaymentDto) { return this.billing.refundPayment(id, dto.amount, dto.reason); }
  @Get('plans') listPlans() { return this.plans.list(true); }
  @Post('plans') createPlan(@Body() dto: SavePlanDto) { return this.plans.create(dto as any); }
  @Put('plans/:id') updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SavePlanDto) { return this.plans.update(id, dto as any); }
  @Delete('plans/:id') removePlan(@Param('id', ParseUUIDPipe) id: string) { return this.plans.remove(id); }
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
