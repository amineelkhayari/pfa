import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Public } from '../../auth/decorators/auth.decorators';
import { MessageService } from '../../message/message.service';
import { StoreService } from '../../stores/store.service';
import { Order } from '../../stores/entities/order.entity';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { ShopifyOAuthService } from '../services/shopify-oauth.service';
import { ShopifyService } from '../services/shopify.service';
import { hasShopifyWhatsAppConfirmation, type ShopifyOrderPayload } from '../services/shopify.service';
import { ShopifyWebhookDelivery } from '../entities/shopify-webhook-delivery.entity';
import { CommerceNotificationService, type CommerceOrderEvent } from '../../stores/commerce-notification.service';

@Controller('shopify/webhooks')
@Public()
export class ShopifyWebhookController {
  constructor(
    private readonly stores: StoreService,
    private readonly shopify: ShopifyService,
    private readonly oauth: ShopifyOAuthService,
    private readonly messages: MessageService,
    private readonly encryption: CredentialEncryptionService,
    private readonly notifications: CommerceNotificationService,
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
    await this.stores.updateIntegrationCredentials(context.store.id, 'shopify', { ...context.settings, lastWebhookAt: new Date().toISOString() });
    if (!webhookId) throw new UnauthorizedException('Missing Shopify webhook id.');
    if (await this.deliveries.findOneBy({ webhookId })) return { received: true, duplicate: true };
    try {
      await this.deliveries.save({ webhookId, storeId: context.store.id, topic: 'orders/updated', status: 'processing', attempts: 1 });
    } catch { return { received: true, duplicate: true }; }
    try {
      const before = await this.orders.findOneBy({ storeId: context.store.id, shopifyOrderId: String(payload.id) });
      const order = await this.shopify.importOrderPayload(payload, context.store.id);
      const events: CommerceOrderEvent[] = [];
      if (before?.financialStatus !== 'paid' && order.financialStatus === 'paid') events.push('paid');
      if (before?.fulfillmentStatus !== 'partial' && order.fulfillmentStatus === 'partial') events.push('partiallyFulfilled');
      if (before?.fulfillmentStatus !== 'fulfilled' && order.fulfillmentStatus === 'fulfilled') events.push('shipped');
      if (before?.status !== 'cancelled' && order.status === 'cancelled') events.push('cancelled');
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
    await this.stores.updateIntegrationCredentials(context.store.id, 'shopify', { ...context.settings, lastWebhookAt: new Date().toISOString() });
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
      if (context.settings.automaticMessagesEnabled === false || context.settings.newOrderMessageEnabled === false) {
        await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
        return { received: true, confirmation: 'skipped_automation_disabled' };
      }
      if (!order.phone) throw new Error('Order has no customer phone number.');
      if (hasShopifyWhatsAppConfirmation(order.tags)) {
        order.status = 'confirmed';
        order.confirmationStatus = 'confirmed';
        order.confirmationSentAt = new Date();
        await this.orders.save(order);
        await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
        return { received: true, alreadyConfirmedByCustomer: true };
      }

      // One Shopify order can contain many line items and can also arrive through simultaneous
      // webhook deliveries. Atomically claim the ORDER before sending so neither case can produce
      // more than one initial confirmation message.
      const claim = await this.orders
        .createQueryBuilder()
        .update(Order)
        .set({ confirmationStatus: 'sending', confirmationError: null })
        .where('id = :id', { id: order.id })
        .andWhere('confirmationStatus IN (:...claimable)', { claimable: ['not_sent', 'failed'] })
        .execute();
      if (!claim.affected) {
        await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
        return { received: true, duplicateOrder: true };
      }

      const configuredTemplate = context.settings.newOrderMessageTemplate;
      const text = typeof configuredTemplate === 'string' && configuredTemplate.trim()
        ? this.notifications.renderTemplate(configuredTemplate, context.store, order)
        : this.confirmationMessage(order);
      const result = await this.messages.sendText(context.store.sessionId, {
        chatId: `${order.phone.replace(/\D/g, '')}@c.us`,
        text,
      });
      order.confirmationStatus = 'pending';
      order.confirmationSentAt = new Date();
      order.whatsappMessageId = result.messageId;
      order.confirmationError = null;
      await this.orders.save(order);
      await this.deliveries.update({ webhookId }, { status: 'completed', error: null });
      return { received: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Order confirmation failed.';
      await this.deliveries.update({ webhookId }, { status: 'failed', error: message });
      const order = await this.orders.findOneBy({ storeId: context.store.id, shopifyOrderId: String(payload.id) });
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

  private confirmationMessage(order: Order): string {
    const items = (order.lineItems ?? [])
      .map(item => `• ${String(item.name ?? item.title ?? 'Product')} × ${String(item.quantity ?? 1)}`)
      .join('\n');
    return `Bonjour ${order.customerName ?? ''} 👋\n\nNous avons reçu votre commande ${order.orderNumber ?? ''}.\n\n${items}\n\nTotal: ${order.totalPrice} ${order.currency}\n\nRépondez 1 pour confirmer ou 2 pour annuler.`;
  }
}
