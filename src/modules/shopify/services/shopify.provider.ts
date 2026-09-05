import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationProvider, ProviderConnection, ProviderCreateOrderInput, ProviderShippingAddress } from '../../../commerce/integration-provider.interface';
import { Order } from '../../stores/entities/order.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { ShopifyService } from './shopify.service';

@Injectable()
export class ShopifyProvider implements IntegrationProvider {
  readonly platform = Platform.SHOPIFY;
  constructor(private readonly shopifyService: ShopifyService) {}
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

  async sync({ storeId, credentials }: ProviderConnection) {
    this.assertConnected(credentials);
    const [products, orders] = await Promise.all([
      this.shopifyService.importProducts(credentials.shopDomain, credentials.accessToken, storeId),
      this.shopifyService.importOrders(credentials.shopDomain, credentials.accessToken, storeId),
    ]);
    return { products, orders };
  }

  async getStoreProfile({ credentials }: ProviderConnection) {
    this.assertConnected(credentials);
    const response = await this.shopifyService.getShop(credentials.shopDomain, credentials.accessToken) as any;
    const shop = response?.shop ?? response;
    return {
      externalId: shop?.id != null ? String(shop.id) : null,
      name: String(shop?.name ?? credentials.shopDomain),
      domain: String(shop?.myshopify_domain ?? shop?.domain ?? credentials.shopDomain),
      ownerName: shop?.shop_owner ?? null,
      email: shop?.email ?? shop?.customer_email ?? null,
      phone: shop?.phone ?? null,
      currency: shop?.currency ?? null,
      timezone: shop?.iana_timezone ?? shop?.timezone ?? null,
      language: shop?.primary_locale ?? null,
    };
  }

  async getStoreKnowledge(connection: ProviderConnection) {
    const { credentials } = connection;
    this.assertConnected(credentials);
    const profile = await this.getStoreProfile(connection);
    const policiesResponse = await this.shopifyService.get<any>(credentials.shopDomain, credentials.accessToken, 'policies.json').catch(() => ({ policies: [] }));
    const deliveryResponse = await this.shopifyService.post<any>(credentials.shopDomain, credentials.accessToken, 'graphql.json', {
      query: `query StoreDeliveryProfiles { deliveryProfiles(first: 10) { nodes { name profileLocationGroups { locationGroupZones(first: 20) { nodes { zone { name countries { code { countryCode restOfWorld } provinces { name code } } } methodDefinitions(first: 20) { nodes { id active description methodConditions { field operator conditionCriteria { __typename ... on MoneyV2 { amount currencyCode } ... on Weight { unit value } } } } } } } } } } } }`,
    }).catch(() => ({ data: { deliveryProfiles: { nodes: [] } } }));
    return {
      profile,
      policies: (policiesResponse?.policies ?? []).slice(0, 10).map((item: any) => ({ type: item.handle, title: item.title, content: String(item.body ?? '').slice(0, 4000), url: item.url })),
      shipping: deliveryResponse?.data?.deliveryProfiles?.nodes ?? [],
      payments: { currencies: (await this.shopifyService.get<any>(credentials.shopDomain, credentials.accessToken, 'shop.json')).shop?.enabled_presentment_currencies ?? [], note: 'Payment methods available to a customer are determined dynamically by Shopify checkout.' },
    };
  }

  async registerWebhooks({ credentials }: ProviderConnection) {
    this.assertConnected(credentials);
    if (!credentials.webhookBaseUrl) return 0;
    await this.shopifyService.ensureWebhooks(credentials.shopDomain, credentials.accessToken, credentials.webhookBaseUrl);
    return 3;
  }

  async confirmOrder({ credentials }: ProviderConnection, order: Order) { this.assertConnected(credentials); await this.shopifyService.markOrderConfirmed(credentials.shopDomain, credentials.accessToken, order); }
  async cancelOrder({ credentials }: ProviderConnection, order: Order) { this.assertConnected(credentials); await this.shopifyService.cancelOrder(credentials.shopDomain, credentials.accessToken, order.shopifyOrderId); }
  async updateShippingAddress({ credentials }: ProviderConnection, order: Order, address: ProviderShippingAddress) { this.assertConnected(credentials); await this.shopifyService.updateOrderShippingAddress(credentials.shopDomain, credentials.accessToken, order.shopifyOrderId, { name: address.customerName, address1: address.address1, city: address.city, zip: address.postalCode, country: address.country, phone: address.phone }); }
  async createOrder({ credentials }: ProviderConnection, input: ProviderCreateOrderInput) {
    this.assertConnected(credentials);
    if (!input.variantId) throw new BadRequestException('Shopify variant is required.');
    return this.shopifyService.createConfirmedChatOrder(credentials.shopDomain, credentials.accessToken, { variantId: input.variantId, quantity: input.quantity, phone: input.phone ?? '', customerName: input.customerName, address1: input.address1, city: input.city, postalCode: input.postalCode, country: input.country });
  }

  private assertConnected(credentials: Record<string, any>) { if (!credentials.shopDomain || !credentials.accessToken) throw new BadRequestException('Shopify is not connected.'); }
}
