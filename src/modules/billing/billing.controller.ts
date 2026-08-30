import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/decorators/auth.decorators';
import { UserAccount } from '../auth/entities/user-account.entity';
import { BillingService } from './billing.service';
import { PlanCatalogService } from './plan-catalog.service';

class CancelSubscriptionDto {
  @IsOptional() @IsString() @MaxLength(128) reason?: string;
}
class CheckoutPlanDto { @IsOptional() @IsString() plan?: string; }

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService, private readonly plans: PlanCatalogService) {}

  @Get('plans') @Public() plansList() { return this.plans.list(); }

  @Get('status')
  status(@Req() req: Request & { user?: UserAccount }) {
    return this.billing.status(this.user(req).id);
  }

  @Get('history')
  history(@Req() req: Request & { user?: UserAccount }, @Query() query: Record<string, string>) {
    return this.billing.history(this.user(req).id, query as any);
  }

  @Post('subscriptions/:id/cancel')
  cancel(@Req() req: Request & { user?: UserAccount }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSubscriptionDto) {
    return this.billing.cancelSubscription(id, this.user(req).id, false, dto.reason);
  }

  @Post('subscriptions/:id/reactivate')
  reactivate(@Req() req: Request & { user?: UserAccount }, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.reactivateSubscription(id, this.user(req).id);
  }

  @Post('stripe/checkout')
  stripeCheckout(@Req() req: Request & { user?: UserAccount }, @Body() dto: CheckoutPlanDto) {
    return this.billing.createStripeCheckout(this.user(req), dto.plan ?? 'pro');
  }

  @Post('stripe/portal')
  stripePortal(@Req() req: Request & { user?: UserAccount }) {
    return this.billing.createStripePortal(this.user(req).id);
  }

  @Post('paypal/subscription')
  paypal(@Req() req: Request & { user?: UserAccount }, @Body() dto: CheckoutPlanDto) {
    return this.billing.createPayPalSubscription(this.user(req), dto.plan ?? 'pro');
  }

  @Post('webhooks/stripe')
  @Public()
  async stripeWebhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    if (!req.rawBody) throw new UnauthorizedException('Missing webhook body');
    await this.billing.handleStripe(req.rawBody, signature);
    return { received: true };
  }

  @Post('webhooks/paypal')
  @Public()
  async paypalWebhook(@Req() req: Request & { body?: Record<string, unknown> }) {
    await this.billing.handlePayPal(req.headers, req.body ?? {});
    return { received: true };
  }

  private user(req: Request & { user?: UserAccount }): UserAccount {
    if (!req.user) throw new UnauthorizedException('A user login token is required');
    return req.user;
  }
}
