import { Injectable } from '@nestjs/common';
import { IntegrationProvider, ProviderConnection, ProviderCreateOrderInput, ProviderShippingAddress } from '../../../commerce/integration-provider.interface';
import { Order } from '../../stores/entities/order.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { YouCanCredentials, YouCanService } from './youcan.service';

@Injectable()
export class YouCanProvider implements IntegrationProvider {
  readonly platform = Platform.YOUCAN;
  constructor(private readonly youcan: YouCanService) {}
  validate(credentials: Record<string, any>) { return this.youcan.validate(credentials as YouCanCredentials); }
  async getStoreProfile(connection: ProviderConnection) {
    const profile: any = await this.youcan.getStore(connection.credentials as YouCanCredentials);
    return {
      externalId: profile?.store_id ?? profile?.id ?? null,
      name: String(profile?.name ?? profile?.slug ?? 'YouCan store'),
      domain: profile?.domain ?? null,
      ownerName: profile?.full_name ?? ([profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null),
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      currency: profile?.currency?.code ?? null,
      timezone: profile?.timezone ?? null,
      language: profile?.language ?? null,
    };
  }
  async getStoreKnowledge(connection: ProviderConnection) {
    return { profile: await this.getStoreProfile(connection), ...await this.youcan.getStoreKnowledge(connection.credentials as YouCanCredentials) };
  }
  sync(connection: ProviderConnection) { return this.youcan.sync(connection.credentials as YouCanCredentials, connection.storeId); }
  registerWebhooks(connection: ProviderConnection) { return this.youcan.ensureWebhooks(connection.credentials as YouCanCredentials, connection.storeId); }
  async confirmOrder(connection: ProviderConnection, order: Order) { await this.youcan.confirmOrder(connection.credentials as YouCanCredentials, order.shopifyOrderId); }
  async cancelOrder(connection: ProviderConnection, order: Order) { await this.youcan.cancelOrder(connection.credentials as YouCanCredentials, order.shopifyOrderId); }
  async updateShippingAddress(connection: ProviderConnection, order: Order, address: ProviderShippingAddress) { await this.youcan.updateOrderShippingAddress(connection.credentials as YouCanCredentials, order.shopifyOrderId, { name: address.customerName, address: address.address1, city: address.city, zip_code: address.postalCode ?? '', country: address.country, phone: address.phone }); }
  createOrder(connection: ProviderConnection, input: ProviderCreateOrderInput) { return this.youcan.createConfirmedChatOrder(connection.credentials as YouCanCredentials, { variantId: input.variantId ?? '', price: input.price, quantity: input.quantity, phone: input.phone ?? '', customerName: input.customerName, address1: input.address1, city: input.city, postalCode: input.postalCode, country: input.country, shippingEstimationId: String(connection.credentials.youcanShippingEstimationId ?? '') }); }
}
