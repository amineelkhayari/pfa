import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { BillingConfig } from './entities/billing-config.entity';

export interface PaymentSettings {
  publicAppUrl?: string; stripeEnabled?: boolean; stripeSecretKey?: string; stripePriceId?: string;
  stripeWebhookSecret?: string; paypalEnabled?: boolean; paypalEnvironment?: 'sandbox' | 'live';
  paypalClientId?: string; paypalClientSecret?: string; paypalPlanId?: string; paypalWebhookId?: string;
  aiOrderConfirmationEnabled?: boolean; openAiApiKey?: string; openAiOrderModel?: string;
  aiOrderMaxTurns?: number; aiOrderConversationTimeoutHours?: number;
  aiProvider?: 'openai' | 'openrouter' | 'gemini' | 'custom'; aiBaseUrl?: string;
}

@Injectable()
export class BillingConfigService implements OnModuleInit {
  private current: PaymentSettings = {};
  constructor(@InjectRepository(BillingConfig, 'main') private readonly repo: Repository<BillingConfig>) {}
  async onModuleInit() { const row = await this.repo.findOneBy({ id: 'default' }); if (row) this.current = this.decrypt(row.encryptedSettings); }
  view() {
    return { publicAppUrl: this.value('publicAppUrl', 'PUBLIC_APP_URL'), stripeEnabled: this.enabled('stripe'), paypalEnabled: this.enabled('paypal'), paypalEnvironment: this.value('paypalEnvironment', 'PAYPAL_ENV') ?? 'sandbox',
      configured: { stripeSecretKey: Boolean(this.value('stripeSecretKey', 'STRIPE_SECRET_KEY')), stripePriceId: Boolean(this.value('stripePriceId', 'STRIPE_PRO_PRICE_ID')), stripeWebhookSecret: Boolean(this.value('stripeWebhookSecret', 'STRIPE_WEBHOOK_SECRET')), paypalClientId: Boolean(this.value('paypalClientId', 'PAYPAL_CLIENT_ID')), paypalClientSecret: Boolean(this.value('paypalClientSecret', 'PAYPAL_CLIENT_SECRET')), paypalPlanId: Boolean(this.value('paypalPlanId', 'PAYPAL_PRO_PLAN_ID')), paypalWebhookId: Boolean(this.value('paypalWebhookId', 'PAYPAL_WEBHOOK_ID')) } };
  }
  async update(patch: PaymentSettings) {
    for (const [key, value] of Object.entries(patch)) if (value !== undefined && value !== '') (this.current as Record<string, unknown>)[key] = value;
    await this.repo.save(this.repo.create({ id: 'default', encryptedSettings: this.encrypt(this.current) }));
    return this.view();
  }
  viewAi() {
    return {
      enabled: this.aiEnabled(),
      provider: this.aiProvider(),
      baseUrl: String(this.current.aiBaseUrl ?? ''),
      model: String(this.value('openAiOrderModel', 'OPENAI_ORDER_MODEL') ?? 'gpt-5.4-nano'),
      maxTurns: this.numberValue('aiOrderMaxTurns', 'AI_ORDER_MAX_TURNS', 8, 2, 50),
      conversationTimeoutHours: this.numberValue('aiOrderConversationTimeoutHours', 'AI_ORDER_CONVERSATION_TIMEOUT_HOURS', 24, 1, 720),
      apiKeyConfigured: Boolean(this.value('openAiApiKey', 'OPENAI_API_KEY')),
    };
  }
  async updateAi(patch: { enabled?: boolean; provider?: 'openai' | 'openrouter' | 'gemini' | 'custom'; baseUrl?: string; apiKey?: string; model?: string; maxTurns?: number; conversationTimeoutHours?: number }) {
    if (patch.baseUrl === '') this.current.aiBaseUrl = '';
    return this.update({
      aiOrderConfirmationEnabled: patch.enabled,
      aiProvider: patch.provider,
      aiBaseUrl: patch.baseUrl,
      openAiApiKey: patch.apiKey,
      openAiOrderModel: patch.model,
      aiOrderMaxTurns: patch.maxTurns,
      aiOrderConversationTimeoutHours: patch.conversationTimeoutHours,
    }).then(() => this.viewAi());
  }
  aiEnabled() {
    const configured = this.current.aiOrderConfirmationEnabled;
    return (configured ?? process.env.AI_ORDER_CONFIRMATION_ENABLED === 'true') && Boolean(this.value('openAiApiKey', 'OPENAI_API_KEY'));
  }
  aiApiKey() { return this.required('openAiApiKey', 'OPENAI_API_KEY'); }
  aiModel() { return String(this.value('openAiOrderModel', 'OPENAI_ORDER_MODEL') ?? 'gpt-5.4-nano'); }
  aiProvider() { return (this.current.aiProvider ?? 'openai') as 'openai' | 'openrouter' | 'gemini' | 'custom'; }
  aiBaseUrl() { return String(this.current.aiBaseUrl ?? ''); }
  aiMaxTurns() { return this.numberValue('aiOrderMaxTurns', 'AI_ORDER_MAX_TURNS', 8, 2, 50); }
  aiTimeoutHours() { return this.numberValue('aiOrderConversationTimeoutHours', 'AI_ORDER_CONVERSATION_TIMEOUT_HOURS', 24, 1, 720); }
  enabled(provider: 'stripe' | 'paypal') { const key = `${provider}Enabled` as keyof PaymentSettings; return this.current[key] === true || (this.current[key] === undefined && Boolean(provider === 'stripe' ? process.env.STRIPE_SECRET_KEY : process.env.PAYPAL_CLIENT_ID)); }
  required(key: keyof PaymentSettings, env: string): string { const value = this.value(key, env); if (!value) throw new ServiceUnavailableException(`${env} is not configured`); return String(value); }
  value(key: keyof PaymentSettings, env: string): any { return this.current[key] ?? process.env[env]; }
  private numberValue(key: keyof PaymentSettings, env: string, fallback: number, min: number, max: number) { const parsed = Number(this.value(key, env)); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback; }
  private master() { const raw = process.env.BILLING_CONFIG_ENCRYPTION_KEY; if (!raw || raw.length < 32) throw new ServiceUnavailableException('BILLING_CONFIG_ENCRYPTION_KEY must contain at least 32 characters'); return createHash('sha256').update(raw).digest(); }
  private encrypt(value: PaymentSettings) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.master(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.'); }
  private decrypt(value: string) { const [iv, tag, data] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', this.master(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString()) as PaymentSettings; }
}
