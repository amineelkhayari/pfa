import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'crypto';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { StoreService } from '../stores/store.service';
import { MessageService } from '../message/message.service';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { WooCommerceService, WooCredentials } from './services/woocommerce.service';

@Controller('woocommerce')
export class WooCommerceController {
  constructor(private readonly stores: StoreService, private readonly woo: WooCommerceService, private readonly messages: MessageService, private readonly encryption: CredentialEncryptionService) {}

  @Post(':storeId/connect') @RequireRole(ApiKeyRole.OPERATOR)
  async connect(@Param('storeId', ParseUUIDPipe) storeId: string) {
    const store = await this.stores.getIntegrationConnection(storeId, 'woocommerce');
    const settings = this.credentials(store);
    settings.webhookSecret ||= randomBytes(32).toString('hex');
    await this.woo.validate(settings);
    const imported = await this.woo.sync(settings, storeId);
    const webhooks = await this.woo.ensureWebhooks(settings, storeId);
    await this.stores.updateIntegrationCredentials(storeId, 'woocommerce', { ...settings, connected: true, importedProducts: imported.products, importedOrders: imported.orders, lastSyncAt: new Date().toISOString() });
    return { ...imported, webhooks, connected: true };
  }

  @Post(':storeId/sync') @RequireRole(ApiKeyRole.OPERATOR)
  async sync(@Param('storeId', ParseUUIDPipe) storeId: string) {
    const store = await this.stores.getIntegrationConnection(storeId, 'woocommerce'); const settings = this.credentials(store);
    const imported = await this.woo.sync(settings, storeId); await this.woo.ensureWebhooks(settings, storeId);
    await this.stores.updateIntegrationCredentials(storeId, 'woocommerce', { ...settings, connected: true, importedProducts: imported.products, importedOrders: imported.orders, lastSyncAt: new Date().toISOString() });
    return imported;
  }

  @Post('webhooks/:storeId/order-created') @Public() @HttpCode(200)
  async orderCreated(@Param('storeId', ParseUUIDPipe) storeId: string, @Req() req: Request & { rawBody?: Buffer }, @Body() payload: any, @Headers('x-wc-webhook-signature') signature?: string) {
    const store = await this.stores.findOneById(storeId); const settings = this.credentials(store);
    if (!req.rawBody || !settings.webhookSecret || !this.woo.verifyWebhook(req.rawBody, signature, settings.webhookSecret)) throw new UnauthorizedException('Invalid WooCommerce webhook signature.');
    const order = await this.woo.importOrder(payload, storeId);
    if (!order.phone) return { received: true, confirmation: 'skipped_no_phone' };
    if (!['not_sent', 'failed'].includes(order.confirmationStatus)) return { received: true, duplicate: true };
    order.confirmationStatus = 'sending'; await this.woo.saveOrder(order);
    try {
      const items = (order.lineItems ?? []).map(item => `• ${String(item.name ?? 'Product')} × ${String(item.quantity ?? 1)}`).join('\n');
      const result = await this.messages.sendText(store.sessionId, { chatId: `${order.phone.replace(/\D/g, '')}@c.us`, text: `Bonjour ${order.customerName ?? ''} 👋\n\nNous avons reçu votre commande ${order.orderNumber ?? ''}.\n\n${items}\n\nTotal: ${order.totalPrice} ${order.currency}\n\nRépondez 1 pour confirmer ou 2 pour annuler.` });
      order.confirmationStatus = 'pending'; order.confirmationSentAt = new Date(); order.whatsappMessageId = result.messageId; order.confirmationError = null;
      await this.woo.saveOrder(order); return { received: true };
    } catch (error) { order.confirmationStatus = 'failed'; order.confirmationError = error instanceof Error ? error.message : 'Message failed'; await this.woo.saveOrder(order); throw error; }
  }

  private credentials(store: { settings?: Record<string, any> }): WooCredentials { return this.encryption.revealSettings(store.settings ?? {}) as unknown as WooCredentials; }
}
