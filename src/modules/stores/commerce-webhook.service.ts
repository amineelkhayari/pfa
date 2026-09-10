import { Injectable } from '@nestjs/common';
import { Order } from './entities/order.entity';
import type { CommerceOrderEvent } from './commerce-notification.service';
import { StoreService } from './store.service';

@Injectable()
export class CommerceWebhookService {
  constructor(private readonly stores: StoreService) {}

  async recordActivity(
    storeId: string,
    provider: string,
    settings: Record<string, any>,
    event?: string,
  ): Promise<void> {
    await this.stores.updateIntegrationCredentials(storeId, provider, {
      ...settings,
      lastWebhookAt: new Date().toISOString(),
      ...(event ? { lastWebhookEvent: event } : {}),
    });
  }

  detectOrderEvents(before: Order | null | undefined, order: Order, hintedEvent?: string): CommerceOrderEvent[] {
    const events = new Set<CommerceOrderEvent>();
    const previousPayment = this.status(before?.financialStatus);
    const payment = this.status(order.financialStatus);
    const previousFulfillment = this.status(before?.fulfillmentStatus);
    const fulfillment = this.status(order.fulfillmentStatus);
    const previousStatus = this.status(before?.status);
    const status = this.status(order.status);
    const hint = this.status(hintedEvent);

    if (previousPayment !== 'paid' && (payment === 'paid' || hint === 'order.paid')) events.add('paid');
    if (!this.isPartial(previousFulfillment) && this.isPartial(fulfillment)) events.add('partiallyFulfilled');
    if (!this.isShipped(previousFulfillment) && this.isShipped(fulfillment)) events.add('shipped');
    if (!this.isCancelled(previousStatus) && (this.isCancelled(status) || hint === 'order.cancelled')) {
      events.add('cancelled');
    }
    return [...events];
  }

  private status(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).trim().toLowerCase().replace(/_/g, '-');
  }

  private isPartial(value: string): boolean {
    return ['partial', 'partially-fulfilled', 'partially-shipped'].includes(value);
  }

  private isShipped(value: string): boolean {
    return ['fulfilled', 'completed', 'shipped', 'delivered'].includes(value);
  }

  private isCancelled(value: string): boolean {
    return ['cancelled', 'canceled', 'canceled-by-seller', 'cancelled-by-seller'].includes(value);
  }
}
