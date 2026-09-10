import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Public } from '../../auth/decorators/auth.decorators';
import { StoreService } from '../../stores/store.service';
import { Order } from '../../stores/entities/order.entity';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { ShopifyOAuthService } from '../services/shopify-oauth.service';
import { ShopifyService } from '../services/shopify.service';
import { hasShopifyWhatsAppConfirmation, type ShopifyOrderPayload } from '../services/shopify.service';
import { ShopifyWebhookDelivery } from '../entities/shopify-webhook-delivery.entity';
import { CommerceNotificationService } from '../../stores/commerce-notification.service';
import { CommerceWebhookService } from '../../stores/commerce-webhook.service';

@Controller('shopify/webhooks')
@Public()
export class ShopifyWebhookController {
  constructor(
    private readonly stores: StoreService,
    private readonly shopify: ShopifyService,
    private readonly oauth: ShopifyOAuthService,
    private readonly encryption: CredentialEncryptionService,
    private readonly notifications: CommerceNotificationService,
    private readonly commerceWebhooks: CommerceWebhookService,
    @InjectRepository(ShopifyWebhookDelivery, 'data')
    private readonly deliveries: Repository<ShopifyWebhookDelivery>,
    @InjectRepository(Order, 'data')
    private readonly orders: Repository<Order>,
  ) {}

  @Post('orders-updated')
  @HttpCode(200)
  async orderUpdated(
    @Req() req: Request & { rawBody?: Buffer }, @Body() payload: ShopifyOrderPayload,
    @Headers('x-shopify-shop-domain') shopDomain?: string, @Headers('x-shopify-hmac-sha256') hmac?: string,
    @Headers('x-shopify-webhook-id') webhookId?: string,
  ) {
    const context = await this.verifiedStore(req.rawBody, shopDomain, hmac);
    await this.commerceWebhooks.recordActivity(context.store.id, 'shopify', context.settings, 'orders/updated');
    if (!webhookId) throw new UnauthorizedException('Missing Shopify webhook id.');
    if (await this.deliveries.findOneBy({ webhookId })) return { received: true, duplicate: true };
    try {
      await this.deliveries.save({ webhookId, storeId: context.store.id, topic: 'orders/updated', status: 'processing', attempts: 1 });
    } catch { return { received: true, duplicate: true }; }
    try {
      const before = await this.orders.findOneBy({ storeId: context.store.id, externalOrderId: String(payload.id) });
      const order = await this.shopify.importOrderPayload(payload, context.store.id);
      const events = this.commerceWebhooks.detectOrderEvents(before, order);
      for (const event of events) await this.notifications.notify(context.store, order, event, context.settings);
      await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
      return { received: true, events };
    } catch (error) {
      await this.deliveries.update({ webhookId }, { status: 'failed', error: error instanceof Error ? error.message : 'Lifecycle notification failed' });
      throw error;
    }
  }

  @Post('orders-create')
  @HttpCode(200)
  async orderCreated(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: ShopifyOrderPayload,
    @Headers('x-shopify-shop-domain') shopDomain?: string,
    @Headers('x-shopify-hmac-sha256') hmac?: string,
    @Headers('x-shopify-webhook-id') webhookId?: string,
  ) {
    const context = await this.verifiedStore(req.rawBody, shopDomain, hmac);
    await this.commerceWebhooks.recordActivity(context.store.id, 'shopify', context.settings, 'orders/create');
    if (!webhookId) throw new UnauthorizedException('Missing Shopify webhook id.');
    const previous = await this.deliveries.findOneBy({ webhookId });
    if (previous?.status !== 'failed' && previous) return { received: true, duplicate: true };
    if (previous) {
      previous.status = 'processing';
      previous.error = null;
      previous.attempts += 1;
      await this.deliveries.save(previous);
    } else {
      try {
        await this.deliveries.save({
          webhookId,
          storeId: context.store.id,
          topic: 'orders/create',
          status: 'processing',
          attempts: 1,
        });
      } catch {
        return { received: true, duplicate: true };
      }
    }

    try {
      const order = await this.shopify.importOrderPayload(payload, context.store.id);
      if (hasShopifyWhatsAppConfirmation(order.tags)) {
        order.status = 'confirmed';
        order.confirmationStatus = 'confirmed';
        order.confirmationSentAt = new Date();
        await this.orders.save(order);
        await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
        return { received: true, alreadyConfirmedByCustomer: true };
      }

      const confirmation = await this.notifications.sendNewOrderConfirmation(context.store, order, context.settings);
      await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
      return { received: true, confirmation };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Order confirmation failed.';
      await this.deliveries.update({ webhookId }, { status: 'failed', error: message });
      const order = await this.orders.findOneBy({ storeId: context.store.id, externalOrderId: String(payload.id) });
      if (order) {
        order.confirmationStatus = 'failed';
        order.confirmationError = message;
        await this.orders.save(order);
      }
      throw error;
    }
  }

  @Post('app-uninstalled')
  @HttpCode(200)
  async uninstalled(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-shopify-shop-domain') shopDomain?: string,
    @Headers('x-shopify-hmac-sha256') hmac?: string,
  ) {
    const context = await this.verifiedStore(req.rawBody, shopDomain, hmac);
    await this.stores.updateIntegrationCredentials(context.store.id, 'shopify', {
      ...context.settings,
      accessToken: '',
      uninstalledAt: new Date().toISOString(),
    });
    return { received: true };
  }

  private async verifiedStore(rawBody: Buffer | undefined, shopDomain?: string, hmac?: string) {
    if (!rawBody || !shopDomain) throw new UnauthorizedException('Invalid Shopify webhook.');
    const stores = await this.stores.findAll();
    for (const store of stores) {
      if (!store.settings) continue;
      const settings = this.encryption.revealSettings(store.settings);
      if (String(settings.shopDomain).toLowerCase() !== shopDomain.toLowerCase()) continue;
      const secret = settings.clientSecret;
      if (typeof secret !== 'string' || !this.oauth.verifyWebhook(rawBody, hmac, secret)) break;
      return { store, settings };
    }
    throw new UnauthorizedException('Invalid Shopify webhook signature.');
  }

}
