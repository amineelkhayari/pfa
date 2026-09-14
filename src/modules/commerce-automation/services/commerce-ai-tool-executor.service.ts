import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { providerSupports } from '../../../commerce/integration-provider.interface';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { createLogger } from '../../../common/services/logger.service';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { Product } from '../../stores/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { CommerceCartConversationService } from './commerce-cart-conversation.service';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { CommerceToolService } from './commerce-tool.service';
import { MessageService } from '../../message/message.service';
import { PlanUsageService } from '../../auth/plan-usage.service';
import { ProductReview } from '../../stores/entities/product-review.entity';
import { OrderReportService } from './order-report.service';

@Injectable()
export class CommerceAiToolExecutorService {
  private readonly logger = createLogger('CommerceAiToolExecutorService');

  constructor(
    private readonly providers: IntegrationProviderRegistry,
    private readonly encryption: CredentialEncryptionService,
    private readonly tools: CommerceToolService,
    private readonly carts: CommerceCartConversationService,
    private readonly orderActions: CommerceOrderActionService,
    private readonly messages: MessageService,
    private readonly planUsage: PlanUsageService,
    private readonly reports: OrderReportService,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
    @InjectRepository(ProductReview, 'data') private readonly reviews: Repository<ProductReview>,
  ) {}

  async execute(
    name: string,
    input: Record<string, unknown>,
    store: Store,
    phone: string,
    catalog: Product[],
    orders: Order[],
    customerText: string,
    sessionId?: string,
    chatId?: string,
  ): Promise<Record<string, unknown>> {
    if (!phone) return { error: 'CUSTOMER_PHONE_UNAVAILABLE' };
    if (name === 'search_products') {
      const query = typeof input.query === 'string' ? input.query.slice(0, 200) : '';
      const limit = Math.min(8, Math.max(1, Number(input.limit) || 5));
      return this.tools.searchProducts(query, catalog, store.currency, limit).call.result;
    }
    if (name === 'get_product_details') return this.productDetails(input, catalog, store.currency);
    if (name === 'list_customer_orders') return this.listOrders(orders);
    if (name === 'get_order_details') return this.orderDetails(input, orders);
    if (name === 'send_order_history_pdf') return this.sendOrderPdf(store, phone, orders, sessionId, chatId);
    if (name === 'send_product_image') return this.sendProductImage(input, store, catalog, sessionId, chatId);
    if (name === 'add_product_review') return this.addReview(input, store, phone, catalog, orders, sessionId);
    if (name === 'get_active_cart') return this.carts.getActiveCart(store, phone, catalog);
    if (name === 'start_new_order') {
      if (!providerSupports(this.providers.get(store.provider), 'createOrder'))
        return { error: 'PROVIDER_CAPABILITY_UNAVAILABLE', capability: 'createOrder', provider: store.provider };
      return this.carts.startFromTool(store, phone, catalog, input);
    }
    if (name === 'get_store_information') {
      const credentials = this.encryption.revealSettings(store.settings ?? {});
      const provider = this.providers.get(store.provider);
      if (!providerSupports(provider, 'storeKnowledge'))
        return { error: 'PROVIDER_CAPABILITY_UNAVAILABLE', capability: 'storeKnowledge', provider: store.provider };
      const live = await provider.getStoreKnowledge({ storeId: store.id, credentials });
      this.log(name, store.id, phone);
      return { provider: store.provider, ...live };
    }
    if (name === 'prepare_shipping_address_update' || name === 'apply_shipping_address_update') {
      if (!providerSupports(this.providers.get(store.provider), 'updateShippingAddress'))
        return {
          error: 'PROVIDER_CAPABILITY_UNAVAILABLE',
          capability: 'updateShippingAddress',
          provider: store.provider,
        };
      return name === 'prepare_shipping_address_update'
        ? this.prepareAddress(input, store, phone, orders)
        : this.applyAddress(input, store, phone, orders, customerText);
    }
    return { error: 'UNKNOWN_TOOL', tool: name };
  }

  private productDetails(input: Record<string, unknown>, catalog: Product[], currency: string) {
    const id = typeof input.product_id === 'string' ? input.product_id : '';
    const product = catalog.find(item => item.id === id);
    if (!product) return { error: 'PRODUCT_NOT_FOUND' };
    return {
      id: product.id,
      name: product.title,
      description: product.description,
      price: Number(product.price),
      currency,
      stock: this.tools.stock(product),
      variants: (product.variants ?? []).slice(0, 20).map(variant => ({
        id: this.scalar(variant.admin_graphql_api_id ?? variant.id),
        name: this.scalar(variant.title ?? variant.name) || 'Default Title',
        price: Number(variant.price ?? product.price),
        stock: Number.isFinite(Number(variant.inventory_quantity ?? variant.inventoryQuantity))
          ? Number(variant.inventory_quantity ?? variant.inventoryQuantity)
          : null,
      })),
    };
  }

  private listOrders(orders: Order[]) {
    return {
      count: orders.length,
      orders: orders.slice(0, 10).map(order => ({
        order_number: order.orderNumber ?? order.externalOrderId,
        status: order.status,
        confirmation_status: order.confirmationStatus,
        total: Number(order.totalPrice),
        currency: order.currency,
        items: (order.lineItems ?? []).map(item => ({
          name: this.scalar(item.title ?? item.name),
          quantity: Number(item.quantity ?? 1),
        })),
      })),
    };
  }

  private orderDetails(input: Record<string, unknown>, orders: Order[]) {
    const order = this.findOrder(orders, input.order_number);
    if (!order) return { error: 'ORDER_NOT_FOUND' };
    return {
      order_number: order.orderNumber ?? order.externalOrderId,
      status: order.status,
      confirmation_status: order.confirmationStatus,
      total: Number(order.totalPrice),
      currency: order.currency,
      items: order.lineItems ?? [],
      shipping_address: order.shippingAddress ?? null,
    };
  }

  private async sendOrderPdf(store: Store, phone: string, orders: Order[], sessionId?: string, chatId?: string) {
    if (!sessionId || !chatId) return { error: 'WHATSAPP_CONTEXT_UNAVAILABLE', sent: false };
    if (!(await this.planUsage.hasSessionCapability(sessionId, 'orderPdf'))) return { error: 'PLAN_UPGRADE_REQUIRED', capability: 'orderPdf', sent: false };
    if (!orders.length) return { error: 'NO_CUSTOMER_ORDERS', sent: false };
    const pdf = await this.reports.customerOrders(store, orders);
    await this.messages.sendDocument(sessionId, { chatId, base64: pdf.toString('base64'), mimetype: 'application/pdf', filename: `orders-${phone.slice(-4)}.pdf`, caption: `Historique de vos commandes chez ${store.name}` });
    this.log('send_order_history_pdf', store.id, phone);
    return { sent: true, format: 'pdf', orders: orders.length };
  }

  private async sendProductImage(input: Record<string, unknown>, store: Store, catalog: Product[], sessionId?: string, chatId?: string) {
    if (!sessionId || !chatId) return { error: 'WHATSAPP_CONTEXT_UNAVAILABLE', sent: false };
    if (!(await this.planUsage.hasSessionCapability(sessionId, 'productImages'))) return { error: 'PLAN_UPGRADE_REQUIRED', capability: 'productImages', sent: false };
    const product = catalog.find(item => item.id === this.scalar(input.product_id));
    if (!product) return { error: 'PRODUCT_NOT_FOUND', sent: false };
    if (!product.imageUrl) return { error: 'PRODUCT_IMAGE_UNAVAILABLE', sent: false };
    await this.messages.sendImage(sessionId, { chatId, url: product.imageUrl, caption: `${product.title}\n${Number(product.price).toFixed(2)} ${store.currency}` });
    this.log('send_product_image', store.id, chatId);
    return { sent: true, product_id: product.id, product_name: product.title };
  }

  private async addReview(input: Record<string, unknown>, store: Store, phone: string, catalog: Product[], orders: Order[], sessionId?: string) {
    if (!sessionId || !(await this.planUsage.hasSessionCapability(sessionId, 'productReviews'))) return { error: 'PLAN_UPGRADE_REQUIRED', capability: 'productReviews', saved: false };
    const order = this.findOrder(orders, input.order_number);
    if (!order) return { error: 'ORDER_NOT_FOUND', saved: false };
    const delivered = /delivered|completed|fulfilled|livr/i.test(`${order.status} ${order.fulfillmentStatus ?? ''}`);
    if (!delivered) return { error: 'ORDER_NOT_DELIVERED', saved: false };
    const requested = this.scalar(input.product_id).trim();
    const requestedLower = requested.toLowerCase();
    const product = catalog.find(item =>
      item.id === requested || item.externalProductId === requested || item.title.toLowerCase() === requestedLower,
    );
    const purchasedItem = (order.lineItems ?? []).find(item => {
      const externalId = this.scalar(item.product_id ?? item.productId);
      const name = this.scalar(item.title ?? item.name).trim().toLowerCase();
      return externalId === (product?.externalProductId ?? requested) ||
        Boolean(requestedLower && (name === requestedLower || name.includes(requestedLower))) ||
        Boolean(product && (name === product.title.toLowerCase() || name.includes(product.title.toLowerCase())));
    });
    if (!purchasedItem) return { error: 'PRODUCT_NOT_IN_ORDER', saved: false };
    const externalProductId = this.scalar(purchasedItem.product_id ?? purchasedItem.productId) || product?.externalProductId;
    const productName = this.scalar(purchasedItem.title ?? purchasedItem.name) || product?.title;
    if (!externalProductId || !productName) return { error: 'PURCHASED_PRODUCT_ID_UNAVAILABLE', saved: false };
    const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 0)));
    const comment = this.text(input.comment, 1000) || null;
    let review = await this.reviews.findOneBy({ orderId: order.id, externalProductId, customerPhone: phone });
    const provider = this.providers.get(store.provider);
    let providerReviewId: string | null = null;
    if (providerSupports(provider, 'createProductReview') && provider.createProductReview) {
      const credentials = this.encryption.revealSettings(store.settings ?? {});
      try {
        const published = await provider.createProductReview(
          { storeId: store.id, credentials },
          {
            reviewId: review?.providerReviewId,
            productId: externalProductId,
            rating,
            comment: comment ?? `${rating}/5`,
            reviewerName: order.customerName || 'WhatsApp customer',
            reviewerEmail: order.email || `whatsapp-${phone}@smartconfirm.local`,
          },
        );
        providerReviewId = published.reviewId;
      } catch (error) {
        this.logger.error(`Product review provider publish failed (store=${store.id}, order=${order.id}): ${error instanceof Error ? error.message : 'unknown error'}`);
        return { error: 'PROVIDER_REVIEW_PUBLISH_FAILED', message: error instanceof Error ? error.message : 'Review publishing failed', saved: false, published: false };
      }
    }
    review ??= this.reviews.create({
      storeId: store.id,
      orderId: order.id,
      productId: product?.id ?? null,
      externalProductId,
      productName,
      customerPhone: phone,
    });
    Object.assign(review, { rating, comment, status: 'published', providerReviewId, productId: product?.id ?? review.productId ?? null, productName });
    await this.reviews.save(review);
    this.log('add_product_review', store.id, phone);
    return {
      saved: true,
      published: providerReviewId !== null,
      provider_review_id: providerReviewId,
      order_number: order.orderNumber ?? order.externalOrderId,
      product_name: productName,
      rating,
    };
  }

  private async prepareAddress(input: Record<string, unknown>, store: Store, phone: string, orders: Order[]) {
    const order = this.findOrder(orders, input.order_number);
    if (!order) return { error: 'ORDER_NOT_FOUND', prepared: false };
    const customerName = this.text(input.customer_name, 150);
    const address1 = this.text(input.address1, 300);
    const city = this.text(input.city, 100);
    const postalCode = this.text(input.postal_code, 30);
    const country = this.text(input.country, 100) || this.scalar(order.shippingAddress?.country) || 'Morocco';
    if (!customerName || !address1 || !city) return { error: 'MISSING_SHIPPING_FIELDS', prepared: false };
    let conversation = await this.conversations.findOneBy({ orderId: order.id });
    conversation ??= this.conversations.create({
      orderId: order.id,
      storeId: store.id,
      status: 'active',
      turnCount: 0,
      turns: [],
    });
    conversation.pendingAction = 'confirm_shipping_address';
    conversation.pendingData = {
      customerName,
      address1,
      city,
      postalCode: postalCode || undefined,
      country,
      phone: order.phone ?? undefined,
    };
    await this.conversations.save(conversation);
    this.log('prepare_shipping_address_update', store.id, phone);
    return {
      prepared: true,
      applied: false,
      order_number: order.orderNumber ?? order.externalOrderId,
      preview: { customer_name: customerName, address1, city, postal_code: postalCode || null, country },
      next_required: 'explicit_confirmation',
      required_reply: 'CONFIRMER',
      instruction: 'The provider has not been updated. Ask the customer to reply CONFIRMER or ANNULER.',
    };
  }

  private async applyAddress(
    input: Record<string, unknown>,
    store: Store,
    phone: string,
    orders: Order[],
    customerText: string,
  ) {
    const order = this.findOrder(orders, input.order_number);
    if (!order) return { error: 'ORDER_NOT_FOUND', updated: false };
    if (!/^(?:confirmer|confirm|oui\s+je\s+confirme|yes\s+i\s+confirm|wakha|نعم|تأكيد)$/i.test(customerText.trim()))
      return { error: 'EXPLICIT_CONFIRMATION_REQUIRED', updated: false, required_reply: 'CONFIRMER' };
    const conversation = await this.conversations.findOneBy({ orderId: order.id });
    if (conversation?.pendingAction !== 'confirm_shipping_address' || !conversation.pendingData)
      return { error: 'NO_PREPARED_SHIPPING_UPDATE', updated: false };
    await this.orderActions.updateShipping(store, order, conversation.pendingData);
    conversation.pendingAction = null;
    conversation.pendingData = null;
    await this.conversations.save(conversation);
    this.log('apply_shipping_address_update', store.id, phone);
    return {
      updated: true,
      provider: store.provider,
      order_number: order.orderNumber ?? order.externalOrderId,
      shipping_address: order.shippingAddress,
    };
  }

  private findOrder(orders: Order[], value: unknown): Order | undefined {
    const requested = this.scalar(value)
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
    return requested
      ? orders.find(
          order =>
            this.scalar(order.orderNumber ?? order.externalOrderId)
              .replace(/[^a-z0-9]/gi, '')
              .toLowerCase() === requested,
        )
      : undefined;
  }

  private text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }
  private scalar(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
  private log(tool: string, storeId: string, phone: string): void {
    this.logger.log('Commerce tool executed', {
      action: 'commerce_tool_executed',
      tool,
      storeId,
      customer: phone.slice(-4),
    });
  }
}
