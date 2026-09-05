import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { PlanUsageService } from '../auth/plan-usage.service';
import { MessageService } from '../message/message.service';
import { CommerceNotificationService, CommerceOrderEvent } from '../stores/commerce-notification.service';
import { StoreService } from '../stores/store.service';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { YouCanOAuthService } from './services/youcan-oauth.service';
import { YouCanCredentials, YouCanService } from './services/youcan.service';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';

@Controller('youcan')
export class YouCanController {
  constructor(private readonly stores: StoreService, private readonly youcan: YouCanService, private readonly oauth: YouCanOAuthService, private readonly encryption: CredentialEncryptionService, private readonly plans: PlanUsageService, private readonly config: ConfigService, private readonly messages: MessageService, private readonly notifications: CommerceNotificationService, private readonly providers: IntegrationProviderRegistry) {}

  @Get('oauth/install')
  async install(@Query('storeId') storeId: string, @Res() response: Response) {
    await this.plans.assertCurrentPlanActive();
    if (!storeId) throw new BadRequestException('storeId is required.');
    const store = await this.stores.getIntegrationConnection(storeId, 'youcan');
    const credentials = this.credentials(store);
    const state = await this.oauth.createState(storeId);
    return response.redirect(this.youcan.authorizationUrl(credentials, state));
  }

  @Post(':storeId/install-url')
  @RequireRole(ApiKeyRole.OPERATOR)
  async installUrl(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.plans.assertCurrentPlanActive();
    const store = await this.stores.getIntegrationConnection(storeId, 'youcan');
    const credentials = this.credentials(store);
    const state = await this.oauth.createState(storeId);
    return { url: this.youcan.authorizationUrl(credentials, state) };
  }

  @Get('oauth/callback')
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() response: Response) {
    if (!code || !state) throw new BadRequestException('Invalid YouCan OAuth callback.');
    const storeId = await this.oauth.consumeState(state);
    const store = await this.stores.getIntegrationConnection(storeId, 'youcan');
    const credentials = this.credentials(store);
    const token = await this.youcan.exchangeCode(credentials, code);
    const connected: YouCanCredentials = { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token };
    let profile: any;
    try {
      profile = await this.youcan.getStore(connected);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`YouCan issued a token, but Store Admin API authentication failed: ${reason}. Confirm these are YouCan Shop Partner App OAuth credentials, not YouCan Pay credentials.`);
    }
    const provider = this.providers.get('youcan');
    const connection = { storeId, credentials: connected };
    await provider.validate(connected);
    const importedProfile = await provider.getStoreProfile(connection);
    const imported = await provider.sync(connection);
    let webhooks = 0;
    let webhookError: string | null = null;
    try { webhooks = await provider.registerWebhooks(connection); }
    catch (error) { webhookError = error instanceof Error ? error.message : 'YouCan webhook registration failed.'; }
    await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...connected, connected: true, storeDomain: profile?.domain ?? profile?.slug ?? null, importedProducts: imported.products, importedOrders: imported.orders, lastSyncAt: new Date().toISOString(), registeredWebhooks: webhooks, webhookRegistrationError: webhookError });
    await this.stores.updateImportedProfile(storeId, importedProfile);
    const redirect = this.config.get<string>('commerce.afterAuthRedirectUrl', '/stores');
    return response.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}youcan=connected&storeId=${encodeURIComponent(storeId)}&products=${imported.products}&orders=${imported.orders}&webhooks=${webhookError ? 'warning' : 'connected'}`);
  }

  @Post(':storeId/sync')
  @RequireRole(ApiKeyRole.OPERATOR)
  async sync(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.plans.assertCurrentPlanActive();
    const store = await this.stores.getIntegrationConnection(storeId, 'youcan'); const credentials = this.credentials(store);
    const provider = this.providers.get('youcan');
    const connection = { storeId, credentials };
    const imported = await provider.sync(connection);
    const profile = await provider.getStoreProfile(connection);
    let webhooks = 0;
    let webhookError: string | null = null;
    try { webhooks = await provider.registerWebhooks(connection); }
    catch (error) { webhookError = error instanceof Error ? error.message : 'YouCan webhook registration failed.'; }
    const lastSyncAt = new Date().toISOString();
    await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...credentials, connected: true, importedProducts: imported.products, importedOrders: imported.orders, lastSyncAt, registeredWebhooks: webhooks, webhookRegistrationError: webhookError });
    await this.stores.updateImportedProfile(storeId, profile);
    return { storeId, ...imported, lastSyncAt, webhooks, webhookError };
  }

  @Post(':storeId/webhooks/register')
  @RequireRole(ApiKeyRole.OPERATOR)
  async registerWebhooks(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.plans.assertCurrentPlanActive();
    const store = await this.stores.getIntegrationConnection(storeId, 'youcan');
    const credentials = this.credentials(store);
    try {
      const registered = await this.providers.get('youcan').registerWebhooks({ storeId, credentials });
      const subscriptions = await this.youcan.listWebhooks(credentials);
      await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...credentials, registeredWebhooks: subscriptions.length, webhookRegistrationError: null, lastWebhookRegistrationAt: new Date().toISOString() });
      return { registered, subscriptions };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'YouCan webhook registration failed.';
      await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...credentials, webhookRegistrationError: reason, lastWebhookRegistrationAt: new Date().toISOString() });
      throw error;
    }
  }

  @Get(':storeId/webhooks')
  @RequireRole(ApiKeyRole.OPERATOR)
  async listWebhooks(@Param('storeId', ParseUUIDPipe) storeId: string) {
    const store = await this.stores.getIntegrationConnection(storeId, 'youcan');
    return this.youcan.listWebhooks(this.credentials(store));
  }

  @Post('webhooks/:storeId')
  @Public()
  @HttpCode(200)
  async webhook(@Param('storeId', ParseUUIDPipe) storeId: string, @Req() req: Request & { rawBody?: Buffer }, @Body() payload: any, @Headers('x-youcan-signature') signature?: string, @Headers('x-youcan-topic') headerEvent?: string) {
    const store = await this.stores.findOneById(storeId); const credentials = this.credentials(store);
    if (!req.rawBody || !this.youcan.verifyWebhook(req.rawBody, signature, credentials.clientSecret)) throw new UnauthorizedException('Invalid YouCan webhook signature.');
    const event = String(headerEvent ?? payload?.event_name ?? payload?.event ?? payload?.type ?? '');
    await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...credentials, lastWebhookAt: new Date().toISOString(), lastWebhookEvent: event });
    if (event === 'app.uninstalled') { await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...credentials, accessToken: undefined, refreshToken: undefined, connected: false, lastWebhookAt: new Date().toISOString() }); return { received: true }; }
    if (!event.startsWith('order.')) return { received: true, ignored: true };
    const source = payload?.data ?? payload; const before = source?.id ? await this.youcan.findOrder(storeId, String(source.id)) : null; const order = await this.youcan.importOrder(payload, storeId);
    if (event === 'order.created') {
      if ((credentials as any).automaticMessagesEnabled === false || (credentials as any).newOrderMessageEnabled === false || !order.phone) return { received: true, confirmation: 'skipped' };
      if (!['not_sent', 'failed'].includes(order.confirmationStatus)) return { received: true, duplicate: true };
      try { const defaultText = `Bonjour ${order.customerName ?? ''} 👋\n\nNous avons reçu votre commande ${order.orderNumber ?? ''}.\n\n${(order.lineItems ?? []).map(i => `• ${String(i.name ?? i.title ?? 'Produit')} × ${String(i.quantity ?? 1)}`).join('\n')}\n\nTotal: ${order.totalPrice} ${order.currency}\n\nRépondez 1 pour confirmer ou 2 pour annuler.`; const text = (credentials as any).newOrderMessageTemplate?.trim() ? this.notifications.renderTemplate((credentials as any).newOrderMessageTemplate, store, order) : defaultText; const sent = await this.messages.sendText(store.sessionId, { chatId: `${order.phone.replace(/\D/g, '')}@c.us`, text }); order.confirmationStatus = 'pending'; order.confirmationSentAt = new Date(); order.whatsappMessageId = sent.messageId; order.confirmationError = null; await this.youcan.saveOrder(order); }
      catch (error) { order.confirmationStatus = 'failed'; order.confirmationError = error instanceof Error ? error.message : 'Message failed'; await this.youcan.saveOrder(order); throw error; }
      return { received: true };
    }
    const events: CommerceOrderEvent[] = [];
    if (event === 'order.paid' || (before?.financialStatus !== 'paid' && order.financialStatus === 'paid')) events.push('paid');
    if (before?.status !== 'cancelled' && order.status === 'cancelled') events.push('cancelled');
    if (before?.fulfillmentStatus !== order.fulfillmentStatus && ['shipped', 'fulfilled', 'delivered'].includes(String(order.fulfillmentStatus))) events.push('shipped');
    for (const item of events) await this.notifications.notify(store, order, item, credentials as any);
    return { received: true, events };
  }

  private credentials(store: { settings?: Record<string, any> }) { return this.encryption.revealSettings(store.settings ?? {}) as unknown as YouCanCredentials; }
}
