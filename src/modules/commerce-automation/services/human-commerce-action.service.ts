import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { phoneToChatId } from '../../../common/utils/phone.util';
import { MessageService } from '../../message/message.service';
import { Order } from '../../stores/entities/order.entity';
import { StoreService } from '../../stores/store.service';
import { CommerceExecutionLogService } from './commerce-execution-log.service';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { OrderReportService } from './order-report.service';
import { PlanUsageService } from '../../auth/plan-usage.service';
import { Product } from '../../stores/entities/product.entity';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { providerSupports } from '../../../commerce/integration-provider.interface';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';

@Injectable()
export class HumanCommerceActionService {
  constructor(
    private readonly stores: StoreService,
    private readonly orderActions: CommerceOrderActionService,
    private readonly messages: MessageService,
    private readonly executions: CommerceExecutionLogService,
    private readonly reports: OrderReportService,
    private readonly planUsage: PlanUsageService,
    private readonly providers: IntegrationProviderRegistry,
    private readonly encryption: CredentialEncryptionService,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
  ) {}

  async createOrder(storeId: string, data: {
    productId: string;
    variantId?: string | null;
    variantTitle?: string | null;
    quantity: number;
    customerName: string;
    phone: string;
    address1: string;
    city: string;
    postalCode?: string;
    country: string;
    notifyCustomer?: boolean;
  }) {
    await this.planUsage.assertCurrentPlanActive();
    const store = await this.stores.findOneById(storeId);
    const product = await this.products.findOneBy({ id: data.productId, storeId });
    if (!product) throw new NotFoundException('Product not found in this store.');
    const quantity = Math.max(1, Math.min(100, Math.trunc(Number(data.quantity) || 1)));
    const customerName = data.customerName?.trim();
    const phone = data.phone?.trim();
    const address1 = data.address1?.trim();
    const city = data.city?.trim();
    const country = data.country?.trim();
    if (!customerName || !phone || !address1 || !city || !country) {
      throw new BadRequestException('Customer name, phone, address, city and country are required.');
    }
    const variant = (product.variants ?? []).find(item => String(item.id ?? item.admin_graphql_api_id ?? '') === String(data.variantId ?? ''));
    const price = Number(variant?.price ?? product.price);
    const provider = this.providers.get(store.provider);
    if (!providerSupports(provider, 'createOrder')) throw new BadRequestException(`${store.provider} cannot create orders.`);
    const execution = await this.executions.start({
      operationKey: `human:create-order:${store.id}:${randomUUID()}`,
      storeId: store.id,
      sessionId: store.sessionId,
      customerPhone: phone,
      provider: store.provider,
      tool: 'human_create_order',
      input: { productId: product.id, variantId: data.variantId ?? null, quantity },
    });
    try {
      const result = await provider.createOrder(
        { storeId: store.id, credentials: this.encryption.revealSettings(store.settings ?? {}) },
        {
          productId: product.externalProductId,
          variantId: store.provider === 'woocommerce' && (data.variantId === product.externalProductId || /^default$/i.test(String(data.variantTitle ?? '')))
            ? null
            : data.variantId || null,
          price,
          quantity,
          phone,
          customerName,
          address1,
          city,
          postalCode: data.postalCode?.trim() || null,
          country,
        },
      );
      await this.orders.upsert({
        storeId: store.id,
        externalOrderId: result.orderId,
        orderNumber: result.orderName,
        email: null,
        phone,
        customerName,
        totalPrice: price * quantity,
        currency: store.currency,
        financialStatus: 'pending',
        fulfillmentStatus: null,
        lineItems: [{ productId: product.externalProductId, variantId: data.variantId || null, title: product.title, variantTitle: data.variantTitle || variant?.title || null, quantity, price }],
        shippingAddress: { name: customerName, address1, city, zip: data.postalCode?.trim() || null, country, phone },
        customer: { name: customerName, phone },
        tags: ['smartconfirm:human-agent'],
        status: 'confirmed',
        confirmationStatus: 'confirmed',
        confirmationSentAt: new Date(),
        confirmationError: null,
        externalCreatedAt: new Date(),
      } as any, ['storeId', 'externalOrderId']);
      const saved = await this.orders.findOneByOrFail({ storeId: store.id, externalOrderId: result.orderId });
      if (data.notifyCustomer !== false) {
        await this.messages.sendText(store.sessionId, {
          chatId: phoneToChatId(phone),
          text: `Commande ${result.orderName ?? ''} créée et confirmée ✅\n${quantity} × ${product.title}${data.variantTitle ? ` — ${data.variantTitle}` : ''}\nTotal: ${(price * quantity).toFixed(2)} ${store.currency}`,
        });
      }
      await this.executions.succeed(execution, { providerOrderId: result.orderId, orderNumber: result.orderName, localOrderId: saved.id });
      return saved;
    } catch (error) {
      await this.executions.fail(execution, error);
      throw error;
    }
  }

  async sendOrderHistoryPdf(storeId: string, orderId: string) {
    const { store, order } = await this.context(storeId, orderId);
    if (!order.phone) throw new BadRequestException('The order has no customer phone number.');
    if (!(await this.planUsage.hasSessionCapability(store.sessionId, 'orderPdf'))) {
      throw new BadRequestException('The current plan does not include order-history PDF messages.');
    }
    const candidates = await this.orders.find({ where: { storeId }, order: { externalCreatedAt: 'DESC', createdAt: 'DESC' } });
    const customerOrders = candidates.filter(candidate => candidate.phone && candidate.phone.replace(/\D/g, '') === order.phone!.replace(/\D/g, ''));
    const pdf = await this.reports.customerOrders(store, customerOrders);
    const execution = await this.executions.start({
      operationKey: `human:order-pdf:${order.id}:${randomUUID()}`,
      storeId,
      sessionId: store.sessionId,
      customerPhone: order.phone,
      orderId: order.id,
      provider: store.provider,
      tool: 'human_send_order_history_pdf',
      input: { orders: customerOrders.length },
    });
    try {
      const result = await this.messages.sendDocument(store.sessionId, {
        chatId: phoneToChatId(order.phone),
        base64: pdf.toString('base64'),
        mimetype: 'application/pdf',
        filename: `orders-${order.phone.replace(/\D/g, '').slice(-4)}.pdf`,
        caption: `Historique de vos commandes chez ${store.name}`,
      });
      await this.executions.succeed(execution, { sent: true, orders: customerOrders.length });
      return { sent: true, orders: customerOrders.length, messageId: result.messageId };
    } catch (error) {
      await this.executions.fail(execution, error);
      throw error;
    }
  }

  private async context(storeId: string, orderId: string) {
    const store = await this.stores.findOneById(storeId);
    const order = await this.orders.findOneBy({ id: orderId, storeId });
    if (!order) throw new NotFoundException('Order not found.');
    return { store, order };
  }

  async changeStatus(storeId: string, orderId: string, action: 'confirm' | 'cancel', notifyCustomer = true) {
    const { store, order } = await this.context(storeId, orderId);
    if (action === 'confirm' && order.confirmationStatus === 'confirmed') throw new BadRequestException('Order is already confirmed.');
    if (action === 'cancel' && order.confirmationStatus === 'cancelled') throw new BadRequestException('Order is already cancelled.');
    const execution = await this.executions.start({
      operationKey: `human:${action}:${order.id}:${randomUUID()}`,
      storeId,
      sessionId: store.sessionId,
      customerPhone: order.phone ?? undefined,
      orderId: order.id,
      provider: store.provider,
      tool: `human_${action}_order`,
      input: { notifyCustomer },
    });
    try {
      await this.orderActions.apply(store, order, action);
      if (notifyCustomer && order.phone) {
        const text = action === 'confirm'
          ? `Votre commande #${order.orderNumber ?? order.externalOrderId} est confirmée ✅`
          : `Votre commande #${order.orderNumber ?? order.externalOrderId} a été annulée.`;
        await this.messages.sendText(store.sessionId, { chatId: phoneToChatId(order.phone), text });
      }
      await this.executions.succeed(execution, { action, status: order.status, notified: notifyCustomer && Boolean(order.phone) });
      return order;
    } catch (error) {
      await this.executions.fail(execution, error);
      throw error;
    }
  }

  async updateAddress(storeId: string, orderId: string, data: {
    customerName: string;
    address1: string;
    city: string;
    postalCode?: string;
    country: string;
    phone?: string;
  }) {
    const { store, order } = await this.context(storeId, orderId);
    if (!data.customerName?.trim() || !data.address1?.trim() || !data.city?.trim() || !data.country?.trim()) {
      throw new BadRequestException('Customer name, address, city and country are required.');
    }
    const clean = {
      customerName: data.customerName.trim(),
      address1: data.address1.trim(),
      city: data.city.trim(),
      postalCode: data.postalCode?.trim() || undefined,
      country: data.country.trim(),
      phone: data.phone?.trim() || order.phone || undefined,
    };
    const execution = await this.executions.start({
      operationKey: `human:update-address:${order.id}:${randomUUID()}`,
      storeId,
      sessionId: store.sessionId,
      customerPhone: order.phone ?? undefined,
      orderId: order.id,
      provider: store.provider,
      tool: 'human_update_shipping_address',
      input: { ...clean, phone: clean.phone ? 'provided' : undefined },
    });
    try {
      await this.orderActions.updateShipping(store, order, clean);
      await this.executions.succeed(execution, { updated: true });
      return order;
    } catch (error) {
      await this.executions.fail(execution, error);
      throw error;
    }
  }
}
