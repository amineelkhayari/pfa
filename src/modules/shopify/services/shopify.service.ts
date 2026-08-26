import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createLogger } from '../../../common/services/logger.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../../stores/entities/product.entity';
import { Order } from '../../stores/entities/order.entity';
import { Repository } from 'typeorm';
import { isAxiosError } from 'axios';

interface ShopifyProductPayload {
  id: string | number;
  title?: string;
  body_html?: string;
  handle?: string;
  product_type?: string;
  vendor?: string;
  status?: string;
  tags?: string;
  image?: { src?: string };
  images?: Array<{ src?: string }>;
  variants?: Array<{ price?: string; [key: string]: unknown }>;
  created_at?: string;
  updated_at?: string;
}

export interface ShopifyOrderPayload {
  id: string | number;
  name?: string;
  order_number?: string | number;
  email?: string;
  phone?: string;
  contact_email?: string;
  total_price?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string;
  line_items?: Array<Record<string, unknown>>;
  shipping_address?: Record<string, unknown> & { phone?: string; name?: string };
  customer?: Record<string, unknown> & { first_name?: string; last_name?: string; phone?: string };
  tags?: string;
  cancelled_at?: string;
  created_at?: string;
}

export const SHOPIFY_WHATSAPP_CONFIRMED_TAG = 'whatsapp-bot-confirmed';

export function hasShopifyWhatsAppConfirmation(tags: string | string[] | null | undefined): boolean {
  const values = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return values.some(tag => {
    const normalized = tag.trim().toLowerCase();
    return normalized === SHOPIFY_WHATSAPP_CONFIRMED_TAG || normalized === 'whatsapp confirmed';
  });
}

@Injectable()
export class ShopifyService {
  private readonly apiVersion = '2025-10';
  private readonly logger = createLogger('ShopifyService');

  constructor(
    private readonly http: HttpService,
    @InjectRepository(Product, 'data')
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order, 'data')
    private readonly orderRepository: Repository<Order>,
  ) {}

  private getBaseUrl(shopDomain: string): string {
    return `https://${shopDomain}/admin/api/${this.apiVersion}`;
  }

  private getHeaders(accessToken: string) {
    return {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private errorDetails(error: unknown, fallback: string): unknown {
    if (isAxiosError(error)) return error.response?.data ?? error.message;
    return error instanceof Error ? error.message : fallback;
  }

  async updateOrderShippingAddress(shopDomain: string, accessToken: string, orderId: string, address: Record<string, unknown>): Promise<void> {
    try {
      await firstValueFrom(this.http.put(
        `${this.getBaseUrl(shopDomain)}/orders/${encodeURIComponent(orderId)}.json`,
        { order: { id: orderId, shipping_address: address } },
        { headers: this.getHeaders(accessToken) },
      ));
    } catch (error) {
      throw new BadRequestException(this.errorDetails(error, 'Unable to update the Shopify delivery address.'));
    }
  }

  async createConfirmedChatOrder(shopDomain: string, accessToken: string, input: {
    variantId: string; quantity: number; phone: string; customerName: string;
    address1: string; city: string; postalCode?: string | null; country: string;
  }): Promise<{ orderId: string; orderName: string | null }> {
    const graphql = async (query: string, variables: Record<string, unknown>) => {
      const response = await firstValueFrom(this.http.post<any>(`${this.getBaseUrl(shopDomain)}/graphql.json`, { query, variables }, { headers: this.getHeaders(accessToken) }));
      if (response.data.errors?.length) throw new BadRequestException(response.data.errors.map((item: any) => item.message).join('; '));
      return response.data.data;
    };
    try {
      const created = await graphql(`mutation CreateChatDraft($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) { draftOrder { id } userErrors { field message } }
      }`, { input: {
        lineItems: [{ variantId: input.variantId, quantity: input.quantity }], phone: input.phone,
        shippingAddress: { firstName: input.customerName, address1: input.address1, city: input.city, zip: input.postalCode || undefined, country: input.country },
        billingAddress: { firstName: input.customerName, address1: input.address1, city: input.city, zip: input.postalCode || undefined, country: input.country },
        tags: ['whatsapp-bot', 'whatsapp-bot-confirmed'], note: 'Confirmed by customer through WhatsApp', sourceName: 'whatsapp',
      } });
      const createResult = created.draftOrderCreate;
      if (createResult.userErrors?.length || !createResult.draftOrder?.id) throw new BadRequestException(createResult.userErrors?.map((item: any) => item.message).join('; ') || 'Shopify did not create the draft order');
      const completed = await graphql(`mutation CompleteChatDraft($id: ID!) {
        draftOrderComplete(id: $id) { draftOrder { order { id name } } userErrors { field message } }
      }`, { id: createResult.draftOrder.id });
      const completeResult = completed.draftOrderComplete;
      if (completeResult.userErrors?.length || !completeResult.draftOrder?.order?.id) throw new BadRequestException(completeResult.userErrors?.map((item: any) => item.message).join('; ') || 'Shopify did not complete the draft order');
      return { orderId: completeResult.draftOrder.order.id, orderName: completeResult.draftOrder.order.name ?? null };
    } catch (error) {
      throw new BadRequestException(this.errorDetails(error, 'Unable to create the Shopify order.'));
    }
  }
  getAuthorizationUrl(
    shopDomain: string,
    clientId: string,
    scopes: string,
    redirectUri: string,
    state: string,
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    });
    const url = `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;

    this.logger.log(`Generating authorization URL for ${shopDomain}: ${url}`);

    return url;
  }

  async exchangeCodeForToken(
    shopDomain: string,
    code: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{
    access_token: string;
    scope: string;
  }> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ access_token: string; scope: string }>(
          `https://${shopDomain}/admin/oauth/access_token`,
          {
            client_id: clientId,
            client_secret: clientSecret,
            code,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      throw new BadRequestException(this.errorDetails(error, 'Failed to exchange Shopify OAuth code.'));
    }
  }
  /**
   * Generic GET request
   */
  async get<T>(shopDomain: string, accessToken: string, endpoint: string): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(`${this.getBaseUrl(shopDomain)}/${endpoint}`, {
          headers: this.getHeaders(accessToken),
        }),
      );

      return response.data;
    } catch (error: unknown) {
      throw new InternalServerErrorException(this.errorDetails(error, 'Shopify request failed.'));
    }
  }

  /**
   * Generic POST request
   */
  async post<T>(shopDomain: string, accessToken: string, endpoint: string, body: unknown): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.post<T>(`${this.getBaseUrl(shopDomain)}/${endpoint}`, body, {
          headers: this.getHeaders(accessToken),
        }),
      );

      return response.data;
    } catch (error: unknown) {
      throw new InternalServerErrorException(this.errorDetails(error, 'Shopify request failed.'));
    }
  }

  async put<T>(shopDomain: string, accessToken: string, endpoint: string, body: unknown): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.put<T>(`${this.getBaseUrl(shopDomain)}/${endpoint}`, body, {
          headers: this.getHeaders(accessToken),
        }),
      );
      return response.data;
    } catch (error: unknown) {
      throw new InternalServerErrorException(this.errorDetails(error, 'Shopify request failed.'));
    }
  }

  /**
   * Validate Shopify credentials
   */
  async validateConnection(shopDomain: string, accessToken: string): Promise<boolean> {
    try {
      await this.get(shopDomain, accessToken, 'shop.json');

      return true;
    } catch {
      throw new BadRequestException('Invalid Shopify credentials.');
    }
  }

  /**
   * Get shop information
   */
  async getShop(shopDomain: string, accessToken: string) {
    return this.get(shopDomain, accessToken, 'shop.json');
  }

  /**
   * Get products
   */
  async getProducts(shopDomain: string, accessToken: string): Promise<ShopifyProductPayload[]> {
    const response = await this.get<{ products?: ShopifyProductPayload[] }>(
      shopDomain,
      accessToken,
      'products.json?limit=250',
    );
    return response.products ?? [];
  }

  /**
   * Get orders
   */
  async getOrders(shopDomain: string, accessToken: string): Promise<ShopifyOrderPayload[]> {
    const response = await this.get<{ orders?: ShopifyOrderPayload[] }>(
      shopDomain,
      accessToken,
      'orders.json?status=any&limit=250',
    );
    return response.orders ?? [];
  }

  /**
   * Get customers
   */
  async getCustomers(shopDomain: string, accessToken: string) {
    return this.get(shopDomain, accessToken, 'customers.json');
  }

  /**
   * Get one order
   */
  async getOrder(shopDomain: string, accessToken: string, orderId: string) {
    return this.get(shopDomain, accessToken, `orders/${orderId}.json`);
  }

  async markOrderConfirmed(shopDomain: string, accessToken: string, order: Order): Promise<void> {
    const tags = Array.from(new Set([...(order.tags ?? []), SHOPIFY_WHATSAPP_CONFIRMED_TAG]));
    const remote = await this.get<{
      order?: { note_attributes?: Array<{ name: string; value: string }> };
    }>(shopDomain, accessToken, `orders/${order.shopifyOrderId}.json?fields=id,note_attributes`);
    const existingAttributes = remote.order?.note_attributes ?? [];
    const noteAttributes = [
      ...existingAttributes.filter(attribute => attribute.name !== 'WhatsApp confirmation'),
      { name: 'WhatsApp confirmation', value: 'Confirmed' },
    ];
    await this.put(shopDomain, accessToken, `orders/${order.shopifyOrderId}.json`, {
      order: {
        id: order.shopifyOrderId,
        tags: tags.join(', '),
        note_attributes: noteAttributes,
      },
    });
    order.tags = tags;
  }

  async cancelOrder(shopDomain: string, accessToken: string, orderId: string): Promise<void> {
    await this.post(shopDomain, accessToken, `orders/${orderId}/cancel.json`, {});
  }

  /**
   * Create Shopify webhook
   */
  async createWebhook(shopDomain: string, accessToken: string, topic: string, address: string) {
    return this.post(shopDomain, accessToken, 'webhooks.json', {
      webhook: {
        topic,
        address,
        format: 'json',
      },
    });
  }

  async ensureWebhooks(shopDomain: string, accessToken: string, baseUrl: string): Promise<void> {
    const response = await this.get<{ webhooks?: Array<{ topic: string; address: string }> }>(
      shopDomain,
      accessToken,
      'webhooks.json',
    );
    const existing = response.webhooks ?? [];
    for (const webhook of [
      { topic: 'orders/create', path: 'orders-create' },
      { topic: 'app/uninstalled', path: 'app-uninstalled' },
    ]) {
      const address = `${baseUrl.replace(/\/$/, '')}/api/shopify/webhooks/${webhook.path}`;
      if (existing.some(item => item.topic === webhook.topic && item.address === address)) continue;
      await this.createWebhook(shopDomain, accessToken, webhook.topic, address);
    }
  }

  async importProducts(shopDomain: string, accessToken: string, storeId: string): Promise<number> {
    const products = await this.getProducts(shopDomain, accessToken);
    const entities = products.map(product => ({
      storeId,
      shopifyProductId: String(product.id),
      title: product.title ?? 'Untitled',
      description: product.body_html ?? null,
      handle: product.handle ?? null,
      productType: product.product_type ?? null,
      vendor: product.vendor ?? null,
      status: product.status ?? 'active',

      tags: product.tags
        ? product.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
        : null,
      imageUrl: product.image?.src ?? product.images?.[0]?.src ?? null,
      variants: product.variants ?? [],
      price: Number.parseFloat(product.variants?.[0]?.price ?? '0') || 0,
      shopifyCreatedAt: product.created_at ? new Date(product.created_at) : new Date(),
      shopifyUpdatedAt: product.updated_at ? new Date(product.updated_at) : new Date(),
    }));
    if (entities.length) {
      const values = entities as unknown as Parameters<typeof this.productRepository.upsert>[0];
      await this.productRepository.upsert(values, ['storeId', 'shopifyProductId']);
    }
    return products.length;
  }

  async importOrders(shopDomain: string, accessToken: string, storeId: string): Promise<number> {
    const orders = await this.getOrders(shopDomain, accessToken);
    const entities = orders.map(order => this.mapOrder(order, storeId));
    if (entities.length) {
      const values = entities as unknown as Parameters<typeof this.orderRepository.upsert>[0];
      await this.orderRepository.upsert(values, ['storeId', 'shopifyOrderId']);
    }
    return orders.length;
  }

  async importOrderPayload(order: ShopifyOrderPayload, storeId: string): Promise<Order> {
    const value = this.mapOrder(order, storeId);
    await this.orderRepository.upsert(value as unknown as Parameters<typeof this.orderRepository.upsert>[0], [
      'storeId',
      'shopifyOrderId',
    ]);
    const saved = await this.orderRepository.findOneBy({ storeId, shopifyOrderId: String(order.id) });
    if (!saved) throw new InternalServerErrorException('Imported Shopify order could not be loaded.');
    return saved;
  }

  private mapOrder(order: ShopifyOrderPayload, storeId: string) {
    const customerName =
      order.shipping_address?.name ??
      [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') ??
      null;
    const confirmedByWhatsApp = hasShopifyWhatsAppConfirmation(order.tags);
    return {
      storeId,
      shopifyOrderId: String(order.id),
      orderNumber: order.name ?? (order.order_number == null ? null : String(order.order_number)),
      email: order.email ?? order.contact_email ?? null,
      phone: order.phone ?? order.shipping_address?.phone ?? order.customer?.phone ?? null,
      customerName: customerName || null,
      totalPrice: Number.parseFloat(order.total_price ?? '0') || 0,
      currency: order.currency ?? 'USD',
      financialStatus: order.financial_status ?? null,
      fulfillmentStatus: order.fulfillment_status ?? null,
      lineItems: order.line_items ?? [],
      shippingAddress: order.shipping_address ?? null,
      customer: order.customer ?? null,
      tags: order.tags
        ? order.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
        : null,
      status: order.cancelled_at ? 'cancelled' : confirmedByWhatsApp ? 'confirmed' : 'open',
      ...(confirmedByWhatsApp ? { confirmationStatus: 'confirmed' } : {}),
      shopifyCreatedAt: order.created_at ? new Date(order.created_at) : new Date(),
    };
  }
}
