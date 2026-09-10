import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';

export interface CustomerOrderRoute {
  pending: Order[];
  referencedOrder?: Order;
  actionableOrder?: Order;
}

@Injectable()
export class CommerceOrderRoutingService {
  constructor(
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(OrderAiConversation, 'data')
    private readonly conversations: Repository<OrderAiConversation>,
  ) {}

  async pendingAddressEdit(customerOrders: Order[]): Promise<{
    conversation: OrderAiConversation;
    order: Order;
  } | null> {
    if (!customerOrders.length) return null;
    const conversation = await this.conversations.findOne({
      where: {
        orderId: In(customerOrders.map(order => order.id)),
        pendingAction: 'confirm_shipping_address',
      },
      order: { updatedAt: 'DESC' },
    });
    if (!conversation) return null;
    const order = customerOrders.find(candidate => candidate.id === conversation.orderId);
    return order ? { conversation, order } : null;
  }

  isPendingEditDecision(text: string): boolean {
    return /^(?:confirmer|confirm|oui\s+je\s+confirme|yes\s+i\s+confirm|wakha|نعم|تأكيد|annuler|cancel|stop|non|لا|إلغاء)$/i.test(
      text.trim(),
    );
  }

  async resolve(customerOrders: Order[], text: string): Promise<CustomerOrderRoute> {
    const pending = customerOrders.filter(candidate => candidate.confirmationStatus === 'pending');
    const referencedOrder = customerOrders.find(candidate => this.referencesOrder(text, candidate));

    if (
      referencedOrder &&
      ['not_sent', 'failed'].includes(referencedOrder.confirmationStatus) &&
      referencedOrder.status === 'open'
    ) {
      referencedOrder.confirmationStatus = 'pending';
      referencedOrder.confirmationError = null;
      await this.orders.save(referencedOrder);
      if (!pending.some(candidate => candidate.id === referencedOrder.id)) pending.unshift(referencedOrder);
    }

    return {
      pending,
      referencedOrder,
      actionableOrder: referencedOrder?.confirmationStatus === 'pending' ? referencedOrder : undefined,
    };
  }

  shouldRequestOrderNumber(pendingCount: number, aiEnabled: boolean, text: string): boolean {
    if (pendingCount <= 1) return false;
    return !aiEnabled || this.hasOrderActionIntent(text);
  }

  pendingChoices(pending: Order[]): string {
    const choices = pending
      .slice(0, 5)
      .map(
        candidate =>
          `• ${candidate.orderNumber ?? candidate.externalOrderId} — ${candidate.totalPrice} ${candidate.currency}`,
      )
      .join('\n');
    return `Vous avez plusieurs commandes en attente. Indiquez le numéro de la commande concernée :\n${choices}`;
  }

  hasOrderActionIntent(text: string): boolean {
    const normalized = text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
    if (normalized === '1' || normalized === '2') return true;
    return /\b(confirm|confirmed|confirmer|confirme|cancel|cancelled|annul|annuler|annule|ma bghit|la ma bghitch)\w*\b|تأكيد|أؤكد|اؤكد|إلغاء|الغاء|ألغي|لا أريد/.test(
      normalized,
    );
  }

  private referencesOrder(text: string, order: Order): boolean {
    const number = String(order.orderNumber ?? '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
    if (!number) return false;
    return text
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .includes(number);
  }
}
