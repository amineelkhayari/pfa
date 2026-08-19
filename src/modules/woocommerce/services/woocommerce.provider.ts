import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../../ecomEngine/interface/integration-provider.interface';
import { WooCommerceService, WooCredentials } from './woocommerce.service';

@Injectable()
export class WooCommerceProvider implements IntegrationProvider {
  readonly platform = 'woocommerce';
  constructor(private readonly woo: WooCommerceService) {}
  async validate(credentials: Record<string, any>) { await this.woo.validate(credentials as WooCredentials); }
  async registerWebhooks(connection: any) { await this.woo.ensureWebhooks(connection.credentials, connection.storeId); }
  async syncProducts(): Promise<void> { return; }
  async syncOrders(): Promise<void> { return; }
  async syncCustomers(): Promise<void> { return; }
}
