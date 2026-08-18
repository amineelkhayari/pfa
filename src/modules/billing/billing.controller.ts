import { Controller, Get, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/auth.decorators';
import { UserAccount } from '../auth/entities/user-account.entity';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('status')
  status(@Req() req: Request & { user?: UserAccount }) {
    return this.billing.status(this.user(req).id);
  }

  @Post('stripe/checkout')
  stripeCheckout(@Req() req: Request & { user?: UserAccount }) {
    return this.billing.createStripeCheckout(this.user(req));
  }

  @Post('stripe/portal')
  stripePortal(@Req() req: Request & { user?: UserAccount }) {
    return this.billing.createStripePortal(this.user(req).id);
  }

  @Post('paypal/subscription')
  paypal(@Req() req: Request & { user?: UserAccount }) {
    return this.billing.createPayPalSubscription(this.user(req));
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
