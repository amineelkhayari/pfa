import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../../commerce/integration-provider.interface';
import { YouCanCredentials, YouCanService } from './youcan.service';

@Injectable()
export class YouCanProvider implements IntegrationProvider {
  readonly platform = 'youcan';
  constructor(private readonly youcan: YouCanService) {}
  validate(credentials: Record<string, any>) { return this.youcan.validate(credentials as YouCanCredentials); }
  async registerWebhooks(connection: any) { await this.youcan.ensureWebhooks(connection.credentials, connection.storeId); }
  async syncProducts() {}
  async syncOrders() {}
  async syncCustomers() {}
}
