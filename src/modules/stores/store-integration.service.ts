import { Injectable } from '@nestjs/common';
import { IntegrationProviderRegistry } from '../../commerce/integration-provider.registry';
import { CredentialEncryptionService } from '../../common/security/credential-encryption.service';
import { StoreService } from './store.service';

export interface StoreIntegrationOptions {
  credentials?: Record<string, any>;
  validate?: boolean;
  registerWebhooks?: boolean;
  tolerateWebhookFailure?: boolean;
}

@Injectable()
export class StoreIntegrationService {
  constructor(
    private readonly stores: StoreService,
    private readonly providers: IntegrationProviderRegistry,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async synchronize(storeId: string, providerName: string, options: StoreIntegrationOptions = {}) {
    const store = await this.stores.getIntegrationConnection(storeId, providerName);
    const credentials = options.credentials ?? this.encryption.revealSettings(store.settings ?? {});
    const provider = this.providers.get(providerName);
    const connection = { storeId, credentials };

    if (options.validate !== false) await provider.validate(credentials);
    const profile = await provider.getStoreProfile(connection);
    const imported = await provider.sync(connection);

    let webhooks = 0;
    let webhookError: string | null = null;
    if (options.registerWebhooks !== false) {
      try {
        webhooks = await provider.registerWebhooks(connection);
      } catch (error) {
        webhookError = error instanceof Error ? error.message : 'Webhook registration failed.';
        if (!options.tolerateWebhookFailure) throw error;
      }
    }

    const lastSyncAt = new Date().toISOString();
    await this.stores.updateIntegrationCredentials(storeId, providerName, {
      ...credentials,
      connected: true,
      storeDomain: profile.domain ?? credentials.storeDomain ?? null,
      importedProducts: imported.products,
      importedOrders: imported.orders,
      lastSyncAt,
      registeredWebhooks: webhooks,
      webhookRegistrationError: webhookError,
    });
    await this.stores.updateImportedProfile(storeId, profile);

    return { storeId, ...imported, profile, lastSyncAt, webhooks, webhookError };
  }
}
