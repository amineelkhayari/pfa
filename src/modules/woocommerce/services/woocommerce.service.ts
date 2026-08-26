import { BadGatewayException, BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Product } from '../../stores/entities/product.entity';
import { Order } from '../../stores/entities/order.entity';

export interface WooCredentials { siteUrl: string; consumerKey: string; consumerSecret: string; webhookSecret?: string; webhookBaseUrl?: string }

@Injectable()
export class WooCommerceService {
  constructor(
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
  ) {}

  normalizeSiteUrl(value: string): string {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('WooCommerce site URL is invalid.'); }
    if (url.protocol !== 'https:') throw new BadRequestException('WooCommerce site URL must use HTTPS.');
    return url.origin + url.pathname.replace(/\/$/, '');
  }

  async validate(credentials: WooCredentials) { return this.request(credentials, 'system_status'); }

  async sync(credentials: WooCredentials, storeId: string) {
    const [products, orders] = await Promise.all([this.all(credentials, 'products'), this.all(credentials, 'orders')]);
    const productEntities = products.map((product: any) => ({
      storeId, shopifyProductId: String(product.id), title: product.name ?? 'Untitled',
      description: product.description || product.short_description || null, handle: product.slug ?? null,
      productType: product.type ?? null, vendor: null, status: product.status === 'publish' ? 'active' : product.status,
      tags: Array.isArray(product.tags) ? product.tags.map((tag: any) => String(tag.name)).filter(Boolean) : null,
      imageUrl: product.images?.[0]?.src ?? null,
      variants: product.variations?.map((id: unknown) => ({ id, title: `Variation ${id}` })) ?? [],
      price: Number.parseFloat(product.price ?? product.regular_price ?? '0') || 0,
      shopifyCreatedAt: product.date_created_gmt ? new Date(`${product.date_created_gmt}Z`) : new Date(),
      shopifyUpdatedAt: product.date_modified_gmt ? new Date(`${product.date_modified_gmt}Z`) : new Date(),
    }));
    if (productEntities.length) await this.products.upsert(productEntities as any, ['storeId', 'shopifyProductId']);
    const orderEntities = orders.map((order: any) => this.mapOrder(order, storeId));
    if (orderEntities.length) await this.orders.upsert(orderEntities as any, ['storeId', 'shopifyOrderId']);
    return { products: productEntities.length, orders: orderEntities.length };
  }

  async importOrder(payload: any, storeId: string): Promise<Order> {
    const value = this.mapOrder(payload, storeId);
    await this.orders.upsert(value as any, ['storeId', 'shopifyOrderId']);
    const saved = await this.orders.findOneBy({ storeId, shopifyOrderId: String(payload.id) });
    if (!saved) throw new InternalServerErrorException('Imported WooCommerce order could not be loaded.');
    return saved;
  }

  saveOrder(order: Order): Promise<Order> { return this.orders.save(order); }

  async ensureWebhooks(credentials: WooCredentials, storeId: string): Promise<number> {
    if (!credentials.webhookBaseUrl || !credentials.webhookSecret) return 0;
    const deliveryUrl = `${credentials.webhookBaseUrl.replace(/\/$/, '')}/api/woocommerce/webhooks/${storeId}/order-created`;
    const existing = await this.all(credentials, 'webhooks');
    if (existing.some((hook: any) => hook.topic === 'order.created' && hook.delivery_url === deliveryUrl && hook.status === 'active')) return 0;
    await this.request(credentials, 'webhooks', { method: 'POST', body: JSON.stringify({ name: 'OpenWA order confirmation', topic: 'order.created', delivery_url: deliveryUrl, secret: credentials.webhookSecret, status: 'active' }) });
    return 1;
  }

  async confirmOrder(credentials: WooCredentials, externalId: string) { await this.request(credentials, `orders/${externalId}`, { method: 'PUT', body: JSON.stringify({ status: 'processing' }) }); }
  async cancelOrder(credentials: WooCredentials, externalId: string) { await this.request(credentials, `orders/${externalId}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); }
  async updateOrderShippingAddress(credentials: WooCredentials, externalId: string, address: Record<string, unknown>) {
    await this.request(credentials, `orders/${externalId}`, { method: 'PUT', body: JSON.stringify({ shipping: address }) });
  }

  async createConfirmedChatOrder(credentials: WooCredentials, input: {
    productId: string; variationId?: string | null; quantity: number; phone: string;
    customerName: string; address1: string; city: string; postalCode?: string | null; country: string;
  }): Promise<{ orderId: string; orderName: string | null }> {
    const [firstName, ...lastParts] = input.customerName.trim().split(/\s+/);
    const address = {
      first_name: firstName || input.customerName,
      last_name: lastParts.join(' '),
      address_1: input.address1,
      city: input.city,
      postcode: input.postalCode || '',
      country: input.country,
      phone: input.phone,
    };
    const payload = await this.request(credentials, 'orders', {
      method: 'POST',
      body: JSON.stringify({
        status: 'processing',
        billing: address,
        shipping: address,
        line_items: [{
          product_id: Number(input.productId),
          quantity: input.quantity,
          ...(input.variationId ? { variation_id: Number(input.variationId) } : {}),
        }],
        meta_data: [{ key: '_openwa_source', value: 'whatsapp-confirmed' }],
      }),
    });
    if (!payload?.id) throw new BadGatewayException('WooCommerce did not return the created order.');
    return { orderId: String(payload.id), orderName: payload.number ? `#${payload.number}` : String(payload.id) };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async all(credentials: WooCredentials, endpoint: string): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await this.request(credentials, `${endpoint}?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new BadGatewayException(`WooCommerce ${endpoint} response is invalid.`);
      result.push(...batch); if (batch.length < 100) break;
    }
    return result;
  }

  private async request(credentials: WooCredentials, endpoint: string, init: RequestInit = {}): Promise<any> {
    const siteUrl = this.normalizeSiteUrl(credentials.siteUrl);
    if (!credentials.consumerKey || !credentials.consumerSecret) throw new BadRequestException('WooCommerce consumer key and secret are required.');
    const response = await fetch(`${siteUrl}/wp-json/wc/v3/${endpoint}`, { ...init, headers: { Authorization: `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new BadGatewayException(`WooCommerce API ${response.status}: ${payload?.message ?? response.statusText}`);
    return payload;
  }

  private mapOrder(order: any, storeId: string) {
    const shipping = order.shipping ?? {}; const billing = order.billing ?? {};
    const customerName = [shipping.first_name || billing.first_name, shipping.last_name || billing.last_name].filter(Boolean).join(' ');
    return { storeId, shopifyOrderId: String(order.id), orderNumber: order.number ? `#${order.number}` : String(order.id),
      email: billing.email ?? null, phone: billing.phone ?? null, customerName: customerName || null,
      totalPrice: Number.parseFloat(order.total ?? '0') || 0, currency: order.currency ?? 'USD',
      financialStatus: order.date_paid ? 'paid' : 'pending', fulfillmentStatus: order.status ?? null,
      lineItems: order.line_items ?? [], shippingAddress: shipping, customer: { id: order.customer_id, ...billing },
      tags: ['woocommerce'], status: order.status === 'cancelled' ? 'cancelled' : 'open',
      shopifyCreatedAt: order.date_created_gmt ? new Date(`${order.date_created_gmt}Z`) : new Date() };
  }
}
