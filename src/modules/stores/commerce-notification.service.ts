import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageService } from '../message/message.service';
import { Store } from './entities/store.entity';
import { Order } from './entities/order.entity';
import { OrderAiConversation } from './entities/order-ai-conversation.entity';
import { phoneToChatId } from '../../common/utils/phone.util';

export type CommerceOrderEvent = 'paid' | 'partiallyFulfilled' | 'shipped' | 'cancelled';
export type NewOrderNotificationResult =
  'sent' | 'skipped_automation_disabled' | 'skipped_no_phone' | 'skipped_whatsapp_created' | 'duplicate';
type EventSetting = { enabled?: boolean; template?: string };

const defaults: Record<CommerceOrderEvent, EventSetting> = {
  paid: {
    enabled: false,
    template:
      'Bonjour {{customerName}} 👋\nLe paiement de votre commande {{orderNumber}} est confirmé.\nTotal : {{total}} {{currency}}.',
  },
  partiallyFulfilled: {
    enabled: false,
    template:
      'Bonjour {{customerName}} 👋\nUne partie de votre commande {{orderNumber}} est prête.\nStatut : {{fulfillmentStatus}}.',
  },
  shipped: {
    enabled: true,
    template:
      'Bonjour {{customerName}} 👋\nVotre commande {{orderNumber}} a été expédiée 📦\n\n{{items}}\n\nSuivi : {{trackingNumber}}',
  },
  cancelled: { enabled: false, template: 'Bonjour {{customerName}},\nVotre commande {{orderNumber}} a été annulée.' },
};

const whatsappOrderMarkers = new Set([
  'whatsapp-bot-confirmed',
  'whatsapp confirmed',
  'whatsapp-confirmed',
  'smartConfirm:whatsapp-confirmed',
]);

export function isWhatsAppCreatedOrder(tags: string[] | null | undefined): boolean {
  return (tags ?? []).some(tag => whatsappOrderMarkers.has(String(tag).trim().toLowerCase()));
}

@Injectable()
export class CommerceNotificationService {
  constructor(
    private readonly messages: MessageService,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
  ) {}

  defaultSettings() {
    return defaults;
  }

  async sendNewOrderConfirmation(
    store: Store,
    order: Order,
    settings: Record<string, any>,
  ): Promise<NewOrderNotificationResult> {
    // Provider webhooks echo orders created by this WhatsApp conversation. Import the
    // order, but never start a second confirmation flow for the same customer action.
    if (isWhatsAppCreatedOrder(order.tags)) {
      order.status = 'confirmed';
      order.confirmationStatus = 'confirmed';
      order.confirmationSentAt ??= new Date();
      order.confirmationError = null;
      await this.orders.save(order);
      return 'skipped_whatsapp_created';
    }
    if (settings.automaticMessagesEnabled === false || settings.newOrderMessageEnabled === false)
      return 'skipped_automation_disabled';
    if (!order.phone) return 'skipped_no_phone';

    const claim = await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({ confirmationStatus: 'sending', confirmationError: null })
      .where('id = :id', { id: order.id })
      .andWhere('confirmationStatus IN (:...claimable)', { claimable: ['not_sent', 'failed'] })
      .execute();
    if (!claim.affected) return 'duplicate';

    try {
      const configured =
        typeof settings.newOrderMessageTemplate === 'string' ? settings.newOrderMessageTemplate.trim() : '';
      const text = configured ? this.renderTemplate(configured, store, order) : this.defaultConfirmationMessage(order);
      const result = await this.messages.sendText(store.sessionId, {
        chatId: phoneToChatId(order.phone),
        text,
      });
      order.confirmationStatus = 'pending';
      order.confirmationSentAt = new Date();
      order.whatsappMessageId = result.messageId;
      order.confirmationError = null;
      await this.orders.save(order);
      return 'sent';
    } catch (error) {
      order.confirmationStatus = 'failed';
      order.confirmationError = error instanceof Error ? error.message : 'Message failed';
      await this.orders.save(order);
      throw error;
    }
  }

  async notify(store: Store, order: Order, event: CommerceOrderEvent, settings: Record<string, any>): Promise<boolean> {
    if (settings.automaticMessagesEnabled === false) return false;
    const configured = (settings.orderNotifications?.[event] ?? {}) as EventSetting;
    const definition = { ...defaults[event], ...configured };
    if (!definition.enabled || !order.phone || !definition.template?.trim()) return false;
    const conversation = await this.conversations.findOneBy({ orderId: order.id });
    const text = this.renderTemplate(definition.template, store, order, conversation?.status ?? 'not started');
    await this.messages.sendText(store.sessionId, { chatId: phoneToChatId(order.phone), text });
    return true;
  }

  renderTemplate(template: string, store: Store, order: Order, aiStatus = 'not started'): string {
    const items =
      (order.lineItems ?? [])
        .map(item => `${String(item.name ?? item.title ?? 'Product')} × ${String(item.quantity ?? 1)}`)
        .join('\n') || '—';
    const tracking = String(order.shippingAddress?.tracking_number ?? order.shippingAddress?.tracking_url ?? '') || '—';
    const values: Record<string, string> = {
      customerName: order.customerName ?? '',
      orderNumber: order.orderNumber ?? '',
      storeName: store.name,
      phone: order.phone ?? '—',
      email: order.email ?? '—',
      total: String(order.totalPrice),
      currency: order.currency,
      paymentStatus: order.financialStatus ?? '—',
      fulfillmentStatus: order.fulfillmentStatus ?? '—',
      confirmationStatus: order.confirmationStatus ?? '—',
      confirmationSentAt: order.confirmationSentAt?.toLocaleString() ?? '—',
      aiStatus,
      items,
      trackingNumber: tracking,
    };
    return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_, key: string) => values[key] ?? '');
  }

  private defaultConfirmationMessage(order: Order): string {
    const items = (order.lineItems ?? [])
      .map(item => `• ${String(item.name ?? item.title ?? 'Product')} × ${String(item.quantity ?? 1)}`)
      .join('\n');
    return `Bonjour ${order.customerName ?? ''} 👋\n\nNous avons reçu votre commande ${order.orderNumber ?? ''}.\n\n${items}\n\nTotal: ${order.totalPrice} ${order.currency}\n\nRépondez 1 pour confirmer ou 2 pour annuler.`;
  }
}
