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
import { MessageService } from '../message/message.service';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { WooCommerceService, WooCredentials } from './services/woocommerce.service';
import { PlanUsageService } from '../auth/plan-usage.service';
import { CommerceNotificationService, type CommerceOrderEvent } from '../stores/commerce-notification.service';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';

@Controller('woocommerce')
export class WooCommerceController {
  constructor(
    private readonly stores: StoreService,
    private readonly woo: WooCommerceService,
    private readonly messages: MessageService,
    private readonly encryption: CredentialEncryptionService,
    private readonly planUsage: PlanUsageService,
    private readonly notifications: CommerceNotificationService,
    private readonly providers: IntegrationProviderRegistry,
  ) {}

  @Post(':storeId/connect')
  @RequireRole(ApiKeyRole.OPERATOR)
  async connect(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.planUsage.assertCurrentPlanActive();
    const store = await this.stores.getIntegrationConnection(storeId, 'woocommerce');
    const settings = this.credentials(store);
    settings.webhookSecret ||= randomBytes(32).toString('hex');
    const provider = this.providers.get('woocommerce');
    const connection = { storeId, credentials: settings };
    await provider.validate(settings);
    const profile = await provider.getStoreProfile(connection);
    const imported = await provider.sync(connection);
    const webhooks = await provider.registerWebhooks(connection);
    await this.stores.updateIntegrationCredentials(storeId, 'woocommerce', {
      ...settings,
      connected: true,
      importedProducts: imported.products,
      importedOrders: imported.orders,
      lastSyncAt: new Date().toISOString(),
      storeDomain: profile.domain,
    });
    await this.stores.updateImportedProfile(storeId, profile);
    return { ...imported, webhooks, connected: true };
  }

  @Post(':storeId/sync')
  @RequireRole(ApiKeyRole.OPERATOR)
  async sync(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.planUsage.assertCurrentPlanActive();
    const store = await this.stores.getIntegrationConnection(storeId, 'woocommerce');
    const settings = this.credentials(store);
    const provider = this.providers.get('woocommerce');
    const connection = { storeId, credentials: settings };
    const imported = await provider.sync(connection);
    const profile = await provider.getStoreProfile(connection);
    await provider.registerWebhooks(connection);
    await this.stores.updateIntegrationCredentials(storeId, 'woocommerce', {
      ...settings,
      connected: true,
      importedProducts: imported.products,
      importedOrders: imported.orders,
      lastSyncAt: new Date().toISOString(),
    });
    await this.stores.updateImportedProfile(storeId, profile);
    return imported;
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
    await this.stores.updateIntegrationCredentials(storeId, 'woocommerce', { ...settings, lastWebhookAt: new Date().toISOString() });
    const order = await this.woo.importOrder(payload, storeId);
    if ((settings as any).automaticMessagesEnabled === false || (settings as any).newOrderMessageEnabled === false) return { received: true, confirmation: 'skipped_automation_disabled' };
    if (!order.phone) return { received: true, confirmation: 'skipped_no_phone' };
    if (!['not_sent', 'failed'].includes(order.confirmationStatus)) return { received: true, duplicate: true };
    order.confirmationStatus = 'sending';
    await this.woo.saveOrder(order);
    try {
      const items = (order.lineItems ?? [])
        .map(item => `• ${String(item.name ?? 'Product')} × ${String(item.quantity ?? 1)}`)
        .join('\n');
      const defaultText = `Bonjour ${order.customerName ?? ''} 👋\n\nNous avons reçu votre commande ${order.orderNumber ?? ''}.\n\n${items}\n\nTotal: ${order.totalPrice} ${order.currency}\n\nRépondez 1 pour confirmer ou 2 pour annuler.`;
      const text = (settings as any).newOrderMessageTemplate?.trim()
        ? this.notifications.renderTemplate((settings as any).newOrderMessageTemplate, store, order)
        : defaultText;
      const result = await this.messages.sendText(store.sessionId, {
        chatId: `${order.phone.replace(/\D/g, '')}@c.us`,
        text,
      });
      order.confirmationStatus = 'pending';
      order.confirmationSentAt = new Date();
      order.whatsappMessageId = result.messageId;
      order.confirmationError = null;
      await this.woo.saveOrder(order);
      return { received: true };
    } catch (error) {
      order.confirmationStatus = 'failed';
      order.confirmationError = error instanceof Error ? error.message : 'Message failed';
      await this.woo.saveOrder(order);
      throw error;
    }
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
    await this.stores.updateIntegrationCredentials(storeId, 'woocommerce', { ...settings, lastWebhookAt: new Date().toISOString() });
    const before = await this.woo.findOrder(storeId, String(payload.id));
    const order = await this.woo.importOrder(payload, storeId);
    const events: CommerceOrderEvent[] = [];
    if (before?.financialStatus !== 'paid' && order.financialStatus === 'paid') events.push('paid');
    if (!['partial', 'partially-shipped'].includes(String(before?.fulfillmentStatus)) && ['partial', 'partially-shipped'].includes(String(order.fulfillmentStatus))) events.push('partiallyFulfilled');
    if (before?.fulfillmentStatus !== 'completed' && order.fulfillmentStatus === 'completed') events.push('shipped');
    if (before?.status !== 'cancelled' && order.status === 'cancelled') events.push('cancelled');
    for (const event of events) await this.notifications.notify(store, order, event, settings as unknown as Record<string, any>);
    return { received: true, events };
  }

  private credentials(store: { settings?: Record<string, any> }): WooCredentials {
    return this.encryption.revealSettings(store.settings ?? {}) as unknown as WooCredentials;
  }
}
