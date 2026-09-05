import { BadGatewayException, BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { Product } from '../../stores/entities/product.entity';
import { Order } from '../../stores/entities/order.entity';

export interface YouCanCredentials {
  clientId: string; clientSecret: string; redirectUri: string; scopes?: string;
  accessToken?: string; refreshToken?: string; webhookBaseUrl?: string; storeDomain?: string;
}

@Injectable()
export class YouCanService {
  private readonly api = 'https://api.youcan.shop';
  constructor(
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
  ) {}

  authorizationUrl(c: YouCanCredentials, state: string) {
    this.validateConfig(c);
    const query = new URLSearchParams({ client_id: c.clientId.trim(), redirect_uri: c.redirectUri.trim(), response_type: 'code', state });
    const scopes = c.scopes || 'read-orders edit-orders delete-orders read-products read-products-review read-categories read-coupons read-customers edit-customers read-pages read-menus read-rest-hooks edit-rest-hooks read-payments read-shipping-zones view-store-info view-store-profits read-upsells';
    for (const scope of scopes.split(/[\s,]+/).filter(Boolean)) query.append('scope[]', scope);
    return `https://seller-area.youcan.shop/admin/oauth/authorize?${query}`;
  }

  async exchangeCode(c: YouCanCredentials, code: string) {
    const response = await fetch(`${this.api}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: c.clientId.trim(),
        client_secret: c.clientSecret.trim(),
        redirect_uri: c.redirectUri.trim(),
        code,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new BadGatewayException(`YouCan OAuth failed (${response.status}): ${body.message ?? response.statusText}`);
    return body as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };
  }

  async getStore(c: YouCanCredentials) { return this.request(c, '/me'); }
  async validate(c: YouCanCredentials) { this.validateConfig(c); if (c.accessToken) await this.getStore(c); }

  async sync(c: YouCanCredentials, storeId: string) {
    const [products, orders] = await Promise.all([this.all(c, '/products?include=variants,images'), this.all(c, '/orders?include=customer,variants,payment,shipping')]);
    const productRows = products.map((p: any) => this.mapProduct(p, storeId));
    if (productRows.length) await this.products.upsert(productRows as any, ['storeId', 'shopifyProductId']);
    const orderRows = orders.map((o: any) => this.mapOrder(o, storeId));
    if (orderRows.length) await this.orders.upsert(orderRows as any, ['storeId', 'shopifyOrderId']);
    return { products: productRows.length, orders: orderRows.length };
  }

  async importOrder(payload: any, storeId: string) {
    const source = payload?.data ?? payload;
    const row = this.mapOrder(source, storeId);
    await this.orders.upsert(row as any, ['storeId', 'shopifyOrderId']);
    const saved = await this.orders.findOneBy({ storeId, shopifyOrderId: String(source.id) });
    if (!saved) throw new InternalServerErrorException('Imported YouCan order could not be loaded.');
    return saved;
  }

  saveOrder(order: Order) { return this.orders.save(order); }
  findOrder(storeId: string, id: string) { return this.orders.findOneBy({ storeId, shopifyOrderId: id }); }

  async ensureWebhooks(c: YouCanCredentials, storeId: string) {
    if (!c.webhookBaseUrl || !c.accessToken) return 0;
    const target = `${c.webhookBaseUrl.replace(/\/$/, '')}/api/youcan/webhooks/${storeId}`;
    let created = 0;
    for (const event of ['order.created', 'order.updated', 'order.paid', 'app.uninstalled']) {
      try { await this.request(c, '/resthooks/subscribe', { method: 'POST', body: JSON.stringify({ event, target_url: target }) }); created++; }
      catch (error) { if (!String(error).toLowerCase().includes('already')) throw error; }
    }
    return created;
  }

  verifyWebhook(raw: Buffer, signature: string | undefined, secret: string) {
    if (!signature) return false;
    const expectedHex = createHmac('sha256', secret).update(raw).digest('hex');
    const expectedBase64 = createHmac('sha256', secret).update(raw).digest('base64');
    return [expectedHex, expectedBase64].some(value => { const a = Buffer.from(value); const b = Buffer.from(signature); return a.length === b.length && timingSafeEqual(a, b); });
  }

  verifyOAuthCallback(originalUrl: string, secret: string) {
    const queryString = originalUrl.split('?')[1] ?? '';
    const params = new URLSearchParams(queryString);
    const received = params.get('hmac');
    if (!received || !/^[a-f0-9]{64}$/i.test(received)) return false;
    params.delete('hmac');
    const expected = createHmac('sha256', secret).update(params.toString()).digest('hex');
    const left = Buffer.from(received, 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  async updateOrderStatus(c: YouCanCredentials, id: string, status: string) { return this.request(c, `/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); }
  async confirmOrder(c: YouCanCredentials, id: string) { return this.updateOrderStatus(c, id, 'processed'); }
  async cancelOrder(c: YouCanCredentials, id: string) { return this.updateOrderStatus(c, id, 'canceled-by-seller'); }
  async updateOrderShippingAddress(c: YouCanCredentials, id: string, address: Record<string, unknown>) { return this.request(c, `/orders/${id}`, { method: 'PUT', body: JSON.stringify({ shipping: address }) }); }

  async createConfirmedChatOrder(c: YouCanCredentials, input: { variantId: string; price: number; quantity: number; phone: string; customerName: string; address1: string; city: string; postalCode?: string | null; country: string; shippingEstimationId: string }) {
    if (!input.shippingEstimationId) throw new BadRequestException('Configure a default YouCan shipping estimation ID before creating WhatsApp orders.');
    const [firstName, ...lastName] = input.customerName.trim().split(/\s+/);
    const customer = await this.request(c, '/customers', { method: 'POST', body: JSON.stringify({ first_name: firstName, last_name: lastName.join(' '), phone: input.phone, country: input.country, city: input.city }) });
    const address = { is_new: true, first_name: firstName, last_name: lastName.join(' '), phone: input.phone, first_line: input.address1, city: input.city, zip_code: input.postalCode ?? '', country_code: input.country };
    const order = await this.request(c, '/orders', { method: 'POST', body: JSON.stringify({ customer_id: customer.id, variants: [{ quantity: input.quantity, price: input.price, variant: { id: input.variantId } }], selected_shipping_estimation_id: input.shippingEstimationId, shipping_address: address, payment_address: address, tags: ['openwa', 'whatsapp-confirmed'] }) });
    if (!order?.id) throw new BadGatewayException('YouCan did not return the created order.');
    return { orderId: String(order.id), orderName: order.ref ? `#${order.ref}` : String(order.id) };
  }

  private validateConfig(c: YouCanCredentials) {
    if (!c.clientId || !c.clientSecret || !c.redirectUri) throw new BadRequestException('YouCan Client ID, Client Secret, and Redirect URI are required.');
  }
  private async all(c: YouCanCredentials, endpoint: string) {
    const rows: any[] = []; let url: string | null = endpoint;
    for (let page = 0; url && page < 20; page++) {
      const body = await this.request(c, url);
      const batch = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(batch)) throw new BadGatewayException('Invalid YouCan list response.');
      rows.push(...batch);
      url = body?.links?.next ?? body?.next_page_url ?? null;
    }
    return rows;
  }
  private async request(c: YouCanCredentials, endpoint: string, init: RequestInit = {}) {
    if (!c.accessToken) throw new BadRequestException('YouCan store is not connected.');
    const url = endpoint.startsWith('http') ? endpoint : `${this.api}${endpoint}`;
    const accessToken = c.accessToken.trim().replace(/^Bearer\s+/i, '');
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body?.detail ?? body?.message ?? body?.error_description ?? body?.error ?? response.statusText;
      throw new BadGatewayException(`YouCan API ${response.status} on ${new URL(url).pathname}: ${detail}`);
    }
    return body;
  }
  private mapProduct(p: any, storeId: string) {
    const variants = p.variants?.data ?? p.variants ?? [];
    const images = p.images?.data ?? p.images ?? [];
    return { storeId, shopifyProductId: String(p.id), title: p.name ?? p.title ?? 'Untitled', description: p.description ?? null, handle: p.slug ?? null, productType: p.type ?? p.category?.name ?? null, vendor: p.vendor ?? null, status: p.status ?? (p.visibility ? 'active' : 'draft'), tags: p.tags ?? null, imageUrl: images[0]?.url ?? images[0]?.src ?? p.thumbnail ?? null, variants, price: Number(p.price ?? variants[0]?.price ?? 0), shopifyCreatedAt: p.created_at ? new Date(p.created_at) : new Date(), shopifyUpdatedAt: p.updated_at ? new Date(p.updated_at) : new Date() };
  }
  private mapOrder(o: any, storeId: string) {
    const customer = o.customer?.data ?? o.customer ?? {}; const shipping = o.shipping?.data ?? o.shipping ?? o.shipping_address ?? {}; const payment = o.payment?.data ?? o.payment ?? {}; const items = o.variants?.data ?? o.variants ?? o.items ?? [];
    const status = String(o.status?.slug ?? o.status_new ?? o.status_text ?? o.status ?? 'open').toLowerCase();
    const financialStatus = String(payment.status_text ?? o.payment_status ?? (o.paid_at ? 'paid' : 'pending')).toLowerCase();
    const fulfillmentStatus = String(shipping.status_text ?? o.shipping_status ?? status).toLowerCase();
    return { storeId, shopifyOrderId: String(o.id), orderNumber: String(o.ref ?? o.number ?? o.id), email: customer.email ?? o.email ?? null, phone: customer.phone ?? shipping.address?.phone ?? shipping.phone ?? o.phone ?? null, customerName: customer.full_name ?? customer.name ?? ([customer.first_name, customer.last_name].filter(Boolean).join(' ') || null), totalPrice: Number(o.total ?? o.total_price ?? 0), currency: o.currency?.code ?? o.currency ?? 'MAD', financialStatus, fulfillmentStatus, lineItems: items, shippingAddress: shipping.address ?? shipping, customer, tags: ['youcan'], status: status.includes('cancel') ? 'cancelled' : status, shopifyCreatedAt: o.created_at ? new Date(o.created_at) : new Date() };
  }
}
