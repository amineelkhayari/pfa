import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../../commerce/integration-provider.interface';
import { WooCommerceService, WooCredentials } from './woocommerce.service';

@Injectable()
export class WooCommerceProvider implements IntegrationProvider {
  readonly platform = 'woocommerce';
  constructor(private readonly woo: WooCommerceService) {}
  async validate(credentials: Record<string, any>): Promise<void> {
    await this.woo.validate(credentials as WooCredentials);
  }

  async registerWebhooks(connection: any): Promise<void> {
    await this.woo.ensureWebhooks(connection.credentials, connection.storeId);
  }

  async syncProducts(): Promise<void> {}
  async syncOrders(): Promise<void> {}
  async syncCustomers(): Promise<void> {}
}
