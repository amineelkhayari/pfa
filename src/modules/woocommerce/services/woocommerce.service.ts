import { BadGatewayException, BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Product } from '../../stores/entities/product.entity';
import { Order } from '../../stores/entities/order.entity';

export interface WooCredentials {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret?: string;
  webhookBaseUrl?: string;
}

@Injectable()
export class WooCommerceService {
  constructor(
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
  ) {}

  normalizeSiteUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('WooCommerce site URL is invalid.');
    }
    if (url.protocol !== 'https:') throw new BadRequestException('WooCommerce site URL must use HTTPS.');
    return url.origin + url.pathname.replace(/\/$/, '');
  }

  async validate(credentials: WooCredentials) {
    return this.request(credentials, 'system_status');
  }

  async getStoreProfile(credentials: WooCredentials) {
    const siteUrl = this.normalizeSiteUrl(credentials.siteUrl);
    let publicInfo: any = {};
    try {
      const response = await fetch(`${siteUrl}/wp-json`);
      if (response.ok) publicInfo = await response.json();
    } catch {
      /* The authenticated WooCommerce response below remains authoritative. */
    }
    const status: any = await this.validate(credentials);
    const environment = status?.environment ?? {};
    const settings = status?.settings ?? {};
    return {
      name: String(publicInfo?.name ?? new URL(siteUrl).hostname),
      url: String(publicInfo?.url ?? environment?.site_url ?? siteUrl),
      email: settings?.admin_email ?? environment?.admin_email ?? null,
      phone: settings?.store_phone ?? null,
      currency: settings?.currency ?? null,
      timezone: settings?.timezone ?? null,
      language: environment?.language ?? null,
    };
  }

  async getStoreKnowledge(credentials: WooCredentials) {
    const siteUrl = this.normalizeSiteUrl(credentials.siteUrl);
    const [shipping, payments] = await Promise.all([
      this.request(credentials, 'shipping/zones').catch(() => []),
      this.request(credentials, 'payment_gateways').catch(() => []),
    ]);
    let pages: any[] = [];
    try {
      const response = await fetch(`${siteUrl}/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,link,title,content`);
      if (response.ok) pages = await response.json();
    } catch {
      /* Policies can be configured manually when WordPress pages are private. */
    }
    const policyPattern =
      /privacy|terms|refund|return|shipping|delivery|confidentialit|condition|remboursement|livraison/i;
    return {
      policies: pages
        .filter(page => policyPattern.test(`${page.slug} ${page.title?.rendered ?? ''}`))
        .slice(0, 10)
        .map(page => ({
          type: page.slug,
          title: page.title?.rendered,
          content: String(page.content?.rendered ?? '').slice(0, 4000),
          url: page.link,
        })),
      shipping: Array.isArray(shipping)
        ? shipping.slice(0, 20).map(zone => ({ id: zone.id, name: zone.name, order: zone.order }))
        : [],
      payments: Array.isArray(payments)
        ? payments
            .filter(item => item.enabled)
            .slice(0, 20)
            .map(item => ({
              id: item.id,
              title: item.title,
              description: String(item.description ?? '').slice(0, 1000),
            }))
        : [],
    };
  }

  async sync(credentials: WooCredentials, storeId: string) {
    const [products, orders] = await Promise.all([this.all(credentials, 'products'), this.all(credentials, 'orders')]);
    const productEntities = products.map((product: any) => ({
      storeId,
      externalProductId: String(product.id),
      title: product.name ?? 'Untitled',
      description: product.description || product.short_description || null,
      handle: product.slug ?? null,
      productType: product.type ?? null,
      vendor: null,
      status: product.status === 'publish' ? 'active' : product.status,
      tags: Array.isArray(product.tags) ? product.tags.map((tag: any) => String(tag.name)).filter(Boolean) : null,
      imageUrl: product.images?.[0]?.src ?? null,
      variants: Array.isArray(product.variations) && product.variations.length
        ? product.variations.map((id: unknown) => ({ id, title: `Variation ${id}` }))
        : [{
            id: product.id,
            title: 'Default',
            price: product.price ?? product.regular_price ?? null,
            stock_quantity: product.stock_quantity ?? null,
            stock_status: product.stock_status ?? null,
            manage_stock: product.manage_stock ?? null,
            sku: product.sku ?? null,
          }],
      price: Number.parseFloat(product.price ?? product.regular_price ?? '0') || 0,
      externalCreatedAt: product.date_created_gmt ? new Date(`${product.date_created_gmt}Z`) : new Date(),
      externalUpdatedAt: product.date_modified_gmt ? new Date(`${product.date_modified_gmt}Z`) : new Date(),
    }));
    if (productEntities.length) await this.products.upsert(productEntities as any, ['storeId', 'externalProductId']);
    const orderEntities = orders.map((order: any) => this.mapOrder(order, storeId));
    if (orderEntities.length) await this.orders.upsert(orderEntities as any, ['storeId', 'externalOrderId']);
    return { products: productEntities.length, orders: orderEntities.length };
  }

  async importOrder(payload: any, storeId: string): Promise<Order> {
    const value = this.mapOrder(payload, storeId);
    await this.orders.upsert(value as any, ['storeId', 'externalOrderId']);
    const saved = await this.orders.findOneBy({ storeId, externalOrderId: String(payload.id) });
    if (!saved) throw new InternalServerErrorException('Imported WooCommerce order could not be loaded.');
    return saved;
  }

  saveOrder(order: Order): Promise<Order> {
    return this.orders.save(order);
  }
  findOrder(storeId: string, externalId: string): Promise<Order | null> {
    return this.orders.findOneBy({ storeId, externalOrderId: externalId });
  }

  async ensureWebhooks(credentials: WooCredentials, storeId: string): Promise<number> {
    if (!credentials.webhookBaseUrl || !credentials.webhookSecret) return 0;
    const existing = await this.all(credentials, 'webhooks');
    let created = 0;
    for (const hook of [
      { topic: 'order.created', path: 'order-created', name: 'SmartConfirm order confirmation' },
      { topic: 'order.updated', path: 'order-updated', name: 'SmartConfirm order lifecycle' },
    ]) {
      const deliveryUrl = `${credentials.webhookBaseUrl.replace(/\/$/, '')}/api/woocommerce/webhooks/${storeId}/${hook.path}`;
      if (
        existing.some(
          (item: any) => item.topic === hook.topic && item.delivery_url === deliveryUrl && item.status === 'active',
        )
      )
        continue;
      await this.request(credentials, 'webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name: hook.name,
          topic: hook.topic,
          delivery_url: deliveryUrl,
          secret: credentials.webhookSecret,
          status: 'active',
        }),
      });
      created += 1;
    }
    return created;
  }

  async confirmOrder(credentials: WooCredentials, externalId: string) {
    await this.request(credentials, `orders/${this.numericId(externalId, 'order')}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'processing' }),
    });
  }
  async cancelOrder(credentials: WooCredentials, externalId: string) {
    await this.request(credentials, `orders/${this.numericId(externalId, 'order')}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    });
  }
  async updateOrderShippingAddress(credentials: WooCredentials, externalId: string, address: Record<string, unknown>) {
    await this.request(credentials, `orders/${this.numericId(externalId, 'order')}`, {
      method: 'PUT',
      body: JSON.stringify({ shipping: { ...address, country: this.countryCode(String(address.country ?? '')) } }),
    });
  }

  async createConfirmedChatOrder(
    credentials: WooCredentials,
    input: {
      productId: string;
      variationId?: string | null;
      quantity: number;
      phone: string;
      customerName: string;
      address1: string;
      city: string;
      postalCode?: string | null;
      country: string;
    },
  ): Promise<{ orderId: string; orderName: string | null }> {
    const [firstName, ...lastParts] = input.customerName.trim().split(/\s+/);
    const address = {
      first_name: firstName || input.customerName,
      last_name: lastParts.join(' '),
      address_1: input.address1,
      city: input.city,
      postcode: input.postalCode || '',
      country: this.countryCode(input.country),
      phone: input.phone,
    };
    const payload = await this.request(credentials, 'orders', {
      method: 'POST',
      body: JSON.stringify({
        // The customer confirmed the order in WhatsApp, but no payment was
        // collected there. Keep it on hold until the merchant records payment.
        status: 'on-hold',
        set_paid: false,
        billing: address,
        shipping: address,
        line_items: [
          {
            product_id: this.numericId(input.productId, 'product'),
            quantity: input.quantity,
            ...(input.variationId && input.variationId !== input.productId
              ? { variation_id: this.numericId(input.variationId, 'variation') }
              : {}),
          },
        ],
        meta_data: [{ key: '_smartConfirm_source', value: 'whatsapp-confirmed' }],
      }),
    });
    if (!payload?.id) throw new BadGatewayException('WooCommerce did not return the created order.');
    return { orderId: String(payload.id), orderName: payload.number ? `#${payload.number}` : String(payload.id) };
  }

  async createProductReview(credentials: WooCredentials, input: { reviewId?: string | null; productId: string; rating: number; comment: string; reviewerName: string; reviewerEmail: string }) {
    const review = await this.request(credentials, input.reviewId ? `products/reviews/${input.reviewId}` : 'products/reviews', {
      method: input.reviewId ? 'PUT' : 'POST',
      body: JSON.stringify({
        product_id: Number(input.productId),
        review: input.comment,
        reviewer: input.reviewerName,
        reviewer_email: input.reviewerEmail,
        rating: input.rating,
        status: 'approved',
      }),
    });
    if (!review?.id) throw new BadGatewayException('WooCommerce did not return the created product review.');
    return { reviewId: String(review.id) };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async all(credentials: WooCredentials, endpoint: string): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await this.request(credentials, `${endpoint}?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new BadGatewayException(`WooCommerce ${endpoint} response is invalid.`);
      result.push(...batch);
      if (batch.length < 100) break;
    }
    return result;
  }

  private numericId(value: string, kind: string): number {
    const normalized = String(value ?? '').trim().replace(/^#/, '');
    if (!/^\d+$/.test(normalized) || Number(normalized) <= 0) {
      throw new BadRequestException(`WooCommerce ${kind} ID must be a positive numeric ID.`);
    }
    return Number(normalized);
  }

  private countryCode(value: string): string {
    const country = value.trim();
    if (/^[a-z]{2}$/i.test(country)) return country.toUpperCase();
    const normalized = country.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const codes: Record<string, string> = {
      maroc: 'MA', morocco: 'MA', france: 'FR', espagne: 'ES', spain: 'ES',
      belgique: 'BE', belgium: 'BE', canada: 'CA', 'united states': 'US', usa: 'US',
      'united kingdom': 'GB', uk: 'GB', allemagne: 'DE', germany: 'DE',
      italie: 'IT', italy: 'IT', portugal: 'PT', tunisie: 'TN', tunisia: 'TN',
      algerie: 'DZ', algeria: 'DZ', senegal: 'SN', 'saudi arabia': 'SA',
      'arabie saoudite': 'SA', uae: 'AE', 'united arab emirates': 'AE',
    };
    return codes[normalized] ?? country.toUpperCase();
  }

  private async request(credentials: WooCredentials, endpoint: string, init: RequestInit = {}): Promise<any> {
    const siteUrl = this.normalizeSiteUrl(credentials.siteUrl);
    if (!credentials.consumerKey || !credentials.consumerSecret)
      throw new BadRequestException('WooCommerce consumer key and secret are required.');
    const response = await fetch(`${siteUrl}/wp-json/wc/v3/${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new BadGatewayException(`WooCommerce API ${response.status}: ${payload?.message ?? response.statusText}`);
    return payload;
  }

  private mapOrder(order: any, storeId: string) {
    const shipping = order.shipping ?? {};
    const billing = order.billing ?? {};
    const customerName = [shipping.first_name || billing.first_name, shipping.last_name || billing.last_name]
      .filter(Boolean)
      .join(' ');
    const metadata = Array.isArray(order.meta_data) ? order.meta_data : [];
    const createdByWhatsApp = metadata.some(
      (entry: any) =>
        String(entry?.key ?? '').toLowerCase() === '_smartConfirm_source' &&
        String(entry?.value ?? '').toLowerCase() === 'whatsapp-confirmed',
    );
    return {
      storeId,
      externalOrderId: String(order.id),
      orderNumber: order.number ? `#${order.number}` : String(order.id),
      email: billing.email ?? null,
      phone: billing.phone ?? null,
      customerName: customerName || null,
      totalPrice: Number.parseFloat(order.total ?? '0') || 0,
      currency: order.currency ?? 'USD',
      financialStatus: order.date_paid ? 'paid' : 'pending',
      fulfillmentStatus: order.status ?? null,
      lineItems: order.line_items ?? [],
      shippingAddress: shipping,
      customer: { id: order.customer_id, ...billing },
      tags: ['woocommerce', ...(createdByWhatsApp ? ['smartConfirm:whatsapp-confirmed'] : [])],
      status: order.status === 'completed' ? 'completed' : order.status === 'cancelled' ? 'cancelled' : createdByWhatsApp ? 'confirmed' : 'open',
      ...(createdByWhatsApp ? { confirmationStatus: 'confirmed' } : {}),
      externalCreatedAt: order.date_created_gmt ? new Date(`${order.date_created_gmt}Z`) : new Date(),
    };
  }
}
