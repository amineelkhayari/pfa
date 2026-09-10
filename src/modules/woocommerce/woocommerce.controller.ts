import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'crypto';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { StoreService } from '../stores/store.service';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { WooCommerceService, WooCredentials } from './services/woocommerce.service';
import { PlanUsageService } from '../auth/plan-usage.service';
import { CommerceNotificationService } from '../stores/commerce-notification.service';
import { StoreIntegrationService } from '../stores/store-integration.service';
import { CommerceWebhookService } from '../stores/commerce-webhook.service';

@Controller('woocommerce')
export class WooCommerceController {
  constructor(
    private readonly stores: StoreService,
    private readonly woo: WooCommerceService,
    private readonly encryption: CredentialEncryptionService,
    private readonly planUsage: PlanUsageService,
    private readonly notifications: CommerceNotificationService,
    private readonly integrations: StoreIntegrationService,
    private readonly commerceWebhooks: CommerceWebhookService,
  ) {}

  @Post(':storeId/connect')
  @RequireRole(ApiKeyRole.OPERATOR)
  async connect(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.planUsage.assertCurrentPlanActive();
    const store = await this.stores.getIntegrationConnection(storeId, 'woocommerce');
    const settings = this.credentials(store);
    settings.webhookSecret ||= randomBytes(32).toString('hex');
    const result = await this.integrations.synchronize(storeId, 'woocommerce', { credentials: settings });
    return { ...result, connected: true };
  }

  @Post(':storeId/sync')
  @RequireRole(ApiKeyRole.OPERATOR)
  async sync(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.planUsage.assertCurrentPlanActive();
    return this.integrations.synchronize(storeId, 'woocommerce');
  }

  @Post('webhooks/:storeId/order-created')
  @Public()
  @HttpCode(200)
  async orderCreated(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any,
    @Headers('x-wc-webhook-signature') signature?: string,
  ) {
    const store = await this.stores.findOneById(storeId);
    const settings = this.credentials(store);
    if (
      !req.rawBody ||
      !settings.webhookSecret ||
      !this.woo.verifyWebhook(req.rawBody, signature, settings.webhookSecret)
    )
      throw new UnauthorizedException('Invalid WooCommerce webhook signature.');
    await this.commerceWebhooks.recordActivity(storeId, 'woocommerce', settings, 'order.created');
    const order = await this.woo.importOrder(payload, storeId);
    const confirmation = await this.notifications.sendNewOrderConfirmation(store, order, settings as unknown as Record<string, any>);
    return { received: true, confirmation };
  }

  @Post('webhooks/:storeId/order-updated')
  @Public()
  @HttpCode(200)
  async orderUpdated(
    @Param('storeId', ParseUUIDPipe) storeId: string, @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: any, @Headers('x-wc-webhook-signature') signature?: string,
  ) {
    const store = await this.stores.findOneById(storeId);
    const settings = this.credentials(store);
    if (!req.rawBody || !settings.webhookSecret || !this.woo.verifyWebhook(req.rawBody, signature, settings.webhookSecret)) throw new UnauthorizedException('Invalid WooCommerce webhook signature.');
    await this.commerceWebhooks.recordActivity(storeId, 'woocommerce', settings, 'order.updated');
    const before = await this.woo.findOrder(storeId, String(payload.id));
    const order = await this.woo.importOrder(payload, storeId);
    const events = this.commerceWebhooks.detectOrderEvents(before, order);
    for (const event of events) await this.notifications.notify(store, order, event, settings as unknown as Record<string, any>);
    return { received: true, events };
  }

  private credentials(store: { settings?: Record<string, any> }): WooCredentials {
    return this.encryption.revealSettings(store.settings ?? {}) as unknown as WooCredentials;
  }
}
