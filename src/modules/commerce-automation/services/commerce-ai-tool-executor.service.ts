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

@Injectable()
export class CommerceAiToolExecutorService {
  private readonly logger = createLogger('CommerceAiToolExecutorService');

  constructor(
    private readonly providers: IntegrationProviderRegistry,
    private readonly encryption: CredentialEncryptionService,
    private readonly tools: CommerceToolService,
    private readonly carts: CommerceCartConversationService,
    private readonly orderActions: CommerceOrderActionService,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
  ) {}

  async execute(
    name: string,
    input: Record<string, unknown>,
    store: Store,
    phone: string,
    catalog: Product[],
    orders: Order[],
    customerText: string,
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
