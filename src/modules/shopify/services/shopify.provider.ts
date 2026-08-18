import { BadRequestException, Injectable } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { IntegrationProvider } from '../../../ecomEngine/interface/integration-provider.interface';

@Injectable()
export class ShopifyProvider implements IntegrationProvider {
  readonly platform = 'shopify';
  constructor(private readonly shopifyService: ShopifyService) {}

  async registerWebhooks(): Promise<void> {
    console.log('[Shopify] Register webhooks');
  }

  async syncProducts(): Promise<void> {
    console.log('[Shopify] Sync products');
  }

  async syncOrders(): Promise<void> {
    console.log('[Shopify] Sync orders');
  }

  async syncCustomers(): Promise<void> {
    console.log('[Shopify] Sync customers');
  }

  //   async validate(
  //   credentials: Record<string, any>,
  // ): Promise<void> {

  //   if (!credentials) {
  //     throw new BadRequestException(
  //       'Credentials are required.',
  //     );
  //   }

  //   if (!credentials.shopDomain) {
  //     throw new BadRequestException(
  //       'shopDomain is required.',
  //     );
  //   }

  //   if (!credentials.accessToken) {
  //     throw new BadRequestException(
  //       'accessToken is required.',
  //     );
  //   }

  //   // await this.shopifyService.validateConnection(
  //   //   credentials.shopDomain,
  //   //   credentials.accessToken,
  //   // );
  // }
  async validate(credentials: Record<string, any>): Promise<void> {
    if (!credentials) {
      throw new BadRequestException('Credentials are required.');
    }

    if (!credentials.clientId) {
      throw new BadRequestException('clientId is required.');
    }

    if (!credentials.clientSecret) {
      throw new BadRequestException('clientSecret is required.');
    }

    if (!credentials.scopes) {
      throw new BadRequestException('scopes are required.');
    }

    if (!credentials.redirectUri) {
      throw new BadRequestException('redirectUri is required.');
    }
  }
}
