import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from './integration-provider.interface';

@Injectable()
export class IntegrationProviderRegistry {
  private readonly providers = new Map<string, IntegrationProvider>();

  register(provider: IntegrationProvider): void {
    this.providers.set(provider.platform, provider);
  }

  get(platform: string): IntegrationProvider {
    const provider = this.providers.get(platform);

    if (!provider) {
      throw new Error(`Provider '${platform}' not found.`);
    }

    return provider;
  }

  getAll(): IntegrationProvider[] {
    return [...this.providers.values()];
  }
}
