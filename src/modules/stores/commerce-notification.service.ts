import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageService } from '../message/message.service';
import { Store } from './entities/store.entity';
import { Order } from './entities/order.entity';
import { OrderAiConversation } from './entities/order-ai-conversation.entity';

export type CommerceOrderEvent = 'paid' | 'partiallyFulfilled' | 'shipped' | 'cancelled';
type EventSetting = { enabled?: boolean; template?: string };

const defaults: Record<CommerceOrderEvent, EventSetting> = {
  paid: { enabled: false, template: 'Bonjour {{customerName}} 👋\nLe paiement de votre commande {{orderNumber}} est confirmé.\nTotal : {{total}} {{currency}}.' },
  partiallyFulfilled: { enabled: false, template: 'Bonjour {{customerName}} 👋\nUne partie de votre commande {{orderNumber}} est prête.\nStatut : {{fulfillmentStatus}}.' },
  shipped: { enabled: true, template: 'Bonjour {{customerName}} 👋\nVotre commande {{orderNumber}} a été expédiée 📦\n\n{{items}}\n\nSuivi : {{trackingNumber}}' },
  cancelled: { enabled: false, template: 'Bonjour {{customerName}},\nVotre commande {{orderNumber}} a été annulée.' },
};

@Injectable()
export class CommerceNotificationService {
  constructor(
    private readonly messages: MessageService,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
  ) {}

  defaultSettings() { return defaults; }

  async notify(store: Store, order: Order, event: CommerceOrderEvent, settings: Record<string, any>): Promise<boolean> {
    if (settings.automaticMessagesEnabled === false) return false;
    const configured = (settings.orderNotifications?.[event] ?? {}) as EventSetting;
    const definition = { ...defaults[event], ...configured };
    if (!definition.enabled || !order.phone || !definition.template?.trim()) return false;
    const conversation = await this.conversations.findOneBy({ orderId: order.id });
    const text = this.renderTemplate(definition.template, store, order, conversation?.status ?? 'not started');
    await this.messages.sendText(store.sessionId, { chatId: `${order.phone.replace(/\D/g, '')}@c.us`, text });
    return true;
  }

  renderTemplate(template: string, store: Store, order: Order, aiStatus = 'not started'): string {
    const items = (order.lineItems ?? []).map(item => `${String(item.name ?? item.title ?? 'Product')} × ${String(item.quantity ?? 1)}`).join('\n') || '—';
    const tracking = String(order.shippingAddress?.tracking_number ?? order.shippingAddress?.tracking_url ?? '') || '—';
    const values: Record<string, string> = {
      customerName: order.customerName ?? '', orderNumber: order.orderNumber ?? '', storeName: store.name,
      phone: order.phone ?? '—', email: order.email ?? '—', total: String(order.totalPrice), currency: order.currency,
      paymentStatus: order.financialStatus ?? '—', fulfillmentStatus: order.fulfillmentStatus ?? '—',
      confirmationStatus: order.confirmationStatus ?? '—', confirmationSentAt: order.confirmationSentAt?.toLocaleString() ?? '—',
      aiStatus, items, trackingNumber: tracking,
    };
    return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_, key: string) => values[key] ?? '');
  }
}
