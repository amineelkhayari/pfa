import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { PlanUsageService } from '../auth/plan-usage.service';
import { CommerceNotificationService } from '../stores/commerce-notification.service';
import { CommerceWebhookService } from '../stores/commerce-webhook.service';
import { StoreService } from '../stores/store.service';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { YouCanOAuthService } from './services/youcan-oauth.service';
import { YouCanCredentials, YouCanService } from './services/youcan.service';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';
import { StoreIntegrationService } from '../stores/store-integration.service';

@Controller('youcan')
export class YouCanController {
  constructor(private readonly stores: StoreService, private readonly youcan: YouCanService, private readonly oauth: YouCanOAuthService, private readonly encryption: CredentialEncryptionService, private readonly plans: PlanUsageService, private readonly config: ConfigService, private readonly notifications: CommerceNotificationService, private readonly providers: IntegrationProviderRegistry, private readonly integrations: StoreIntegrationService, private readonly commerceWebhooks: CommerceWebhookService) {}

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
    const synchronized = await this.integrations.synchronize(storeId, 'youcan', {
      credentials: connected,
      tolerateWebhookFailure: true,
    });
    const redirect = this.config.get<string>('commerce.afterAuthRedirectUrl', '/stores');
    return response.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}youcan=connected&storeId=${encodeURIComponent(storeId)}&products=${synchronized.products}&orders=${synchronized.orders}&webhooks=${synchronized.webhookError ? 'warning' : 'connected'}`);
  }

  @Post(':storeId/sync')
  @RequireRole(ApiKeyRole.OPERATOR)
  async sync(@Param('storeId', ParseUUIDPipe) storeId: string) {
    await this.plans.assertCurrentPlanActive();
    return this.integrations.synchronize(storeId, 'youcan', { tolerateWebhookFailure: true });
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
    await this.commerceWebhooks.recordActivity(storeId, 'youcan', credentials, event);
    if (event === 'app.uninstalled') { await this.stores.updateIntegrationCredentials(storeId, 'youcan', { ...credentials, accessToken: undefined, refreshToken: undefined, connected: false, lastWebhookAt: new Date().toISOString() }); return { received: true }; }
    if (!event.startsWith('order.')) return { received: true, ignored: true };
    const source = payload?.data ?? payload; const before = source?.id ? await this.youcan.findOrder(storeId, String(source.id)) : null; const order = await this.youcan.importOrder(payload, storeId);
    if (event === 'order.created') {
      const confirmation = await this.notifications.sendNewOrderConfirmation(store, order, credentials as unknown as Record<string, any>);
      return { received: true, confirmation };
    }
    const events = this.commerceWebhooks.detectOrderEvents(before, order, event);
    for (const item of events) await this.notifications.notify(store, order, item, credentials as any);
    return { received: true, events };
  }

  private credentials(store: { settings?: Record<string, any> }) { return this.encryption.revealSettings(store.settings ?? {}) as unknown as YouCanCredentials; }
}
