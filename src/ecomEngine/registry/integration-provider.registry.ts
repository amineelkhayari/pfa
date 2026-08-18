// import { Injectable } from '@nestjs/common';
// import { IntegrationProvider } from '../interface/integration-provider.interface';
// import { ShopifyProvider } from '../../modules/shopify/services/shopify.provider';

// @Injectable()
// export class IntegrationProviderRegistry {

//   private readonly providers = new Map<string, IntegrationProvider>();

//   constructor(
//     private readonly shopifyProvider: ShopifyProvider,
//   ) {
//     this.providers.set(
//       this.shopifyProvider.platform,
//       this.shopifyProvider,
//     );
//   }

//   get(platform: string): IntegrationProvider {

//     const provider = this.providers.get(platform);

//     if (!provider) {
//       throw new Error(`Provider '${platform}' not found.`);
//     }

//     return provider;
//   }

//   getAll(): IntegrationProvider[] {
//     return [...this.providers.values()];
//   }
// }

import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../interface/integration-provider.interface';

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
