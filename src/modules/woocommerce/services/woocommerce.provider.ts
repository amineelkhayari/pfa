import { Injectable } from '@nestjs/common';
import { IntegrationProvider, ProviderConnection, ProviderCreateOrderInput, ProviderShippingAddress } from '../../../commerce/integration-provider.interface';
import { Order } from '../../stores/entities/order.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { WooCommerceService, WooCredentials } from './woocommerce.service';

@Injectable()
export class WooCommerceProvider implements IntegrationProvider {
  readonly platform = Platform.WOOCOMMERCE;
  constructor(private readonly woo: WooCommerceService) {}
  async validate(credentials: Record<string, any>): Promise<void> {
    await this.woo.validate(credentials as WooCredentials);
  }

  async getStoreProfile(connection: ProviderConnection) {
    const credentials = connection.credentials as WooCredentials;
    const profile = await this.woo.getStoreProfile(credentials);
    return {
      externalId: profile.url,
      name: profile.name,
      domain: profile.url,
      email: profile.email,
      phone: profile.phone,
      currency: profile.currency,
      timezone: profile.timezone,
      language: profile.language,
    };
  }
  async getStoreKnowledge(connection: ProviderConnection) {
    return { profile: await this.getStoreProfile(connection), ...await this.woo.getStoreKnowledge(connection.credentials as WooCredentials) };
  }

  sync(connection: ProviderConnection) { return this.woo.sync(connection.credentials as WooCredentials, connection.storeId); }
  registerWebhooks(connection: ProviderConnection) { return this.woo.ensureWebhooks(connection.credentials as WooCredentials, connection.storeId); }
  async confirmOrder(connection: ProviderConnection, order: Order) { await this.woo.confirmOrder(connection.credentials as WooCredentials, order.shopifyOrderId); }
  async cancelOrder(connection: ProviderConnection, order: Order) { await this.woo.cancelOrder(connection.credentials as WooCredentials, order.shopifyOrderId); }
  async updateShippingAddress(connection: ProviderConnection, order: Order, address: ProviderShippingAddress) { await this.woo.updateOrderShippingAddress(connection.credentials as WooCredentials, order.shopifyOrderId, { first_name: address.customerName.split(/\s+/)[0], last_name: address.customerName.split(/\s+/).slice(1).join(' '), address_1: address.address1, city: address.city, postcode: address.postalCode ?? '', country: address.country, phone: address.phone }); }
  createOrder(connection: ProviderConnection, input: ProviderCreateOrderInput) { return this.woo.createConfirmedChatOrder(connection.credentials as WooCredentials, { productId: input.productId, variationId: input.variantId, quantity: input.quantity, phone: input.phone ?? '', customerName: input.customerName, address1: input.address1, city: input.city, postalCode: input.postalCode, country: input.country }); }
}
