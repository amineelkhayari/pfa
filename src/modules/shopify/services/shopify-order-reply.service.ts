import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../../core/hooks';
import { createLogger } from '../../../common/services/logger.service';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { MessageService } from '../../message/message.service';
import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { ShopifyService } from './shopify.service';

interface IncomingReply {
  body?: string;
  from?: string;
  chatId?: string;
  senderPhone?: string | null;
  fromMe?: boolean;
}

@Injectable()
export class ShopifyOrderReplyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('ShopifyOrderReplyService');
  private hookId?: string;

  constructor(
    private readonly hooks: HookManager,
    private readonly shopify: ShopifyService,
    private readonly messages: MessageService,
    private readonly encryption: CredentialEncryptionService,
    @InjectRepository(Store, 'data') private readonly stores: Repository<Store>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
  ) {}

  onModuleInit(): void {
    this.hookId = this.hooks.register(
      'shopify-order-confirmation',
      'message:received',
      async context => {
        await this.handleReply(context.sessionId, context.data as IncomingReply);
        return { continue: true, data: context.data };
      },
      20,
    );
  }

  onModuleDestroy(): void {
    if (this.hookId) this.hooks.unregister(this.hookId);
  }

  private async handleReply(sessionId: string | undefined, message: IncomingReply): Promise<void> {
    const reply = message.body?.trim();
    if (!sessionId || message.fromMe || (reply !== '1' && reply !== '2')) return;

    const store = await this.stores.findOneBy({ sessionId });
    if (!store?.settings || store.provider !== Platform.SHOPIFY) return;

    const sender = this.normalizePhone(message.senderPhone ?? message.from ?? message.chatId);
    if (!sender) return;
    const pending = await this.orders.find({
      where: { storeId: store.id, confirmationStatus: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const order = pending.find(candidate => this.samePhone(sender, this.normalizePhone(candidate.phone)));
    if (!order) return;

    order.confirmationStatus = 'processing_reply';
    order.confirmationError = null;
    await this.orders.save(order);

    try {
      const settings = this.encryption.revealSettings(store.settings);
      const shopDomain = typeof settings.shopDomain === 'string' ? settings.shopDomain : '';
      const accessToken = typeof settings.accessToken === 'string' ? settings.accessToken : '';
      if (!shopDomain || !accessToken) throw new Error('Shopify connection is not configured.');

      if (reply === '1') {
        await this.shopify.markOrderConfirmed(shopDomain, accessToken, order);
        order.status = 'confirmed';
        order.confirmationStatus = 'confirmed';
      } else {
        await this.shopify.cancelOrder(shopDomain, accessToken, order.shopifyOrderId);
        order.status = 'cancelled';
        order.confirmationStatus = 'cancelled';
      }
      await this.orders.save(order);

      const chatId = message.chatId ?? message.from;
      if (chatId) {
        await this.messages.sendText(sessionId, {
          chatId,
          text:
            reply === '1'
              ? `Merci, votre commande ${order.orderNumber ?? ''} est confirmée ✅`
              : `Votre commande ${order.orderNumber ?? ''} a été annulée.`,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to process the order reply.';
      order.confirmationStatus = 'pending';
      order.confirmationError = reason;
      await this.orders.save(order);
      this.logger.error(`Failed to process Shopify order reply (session=${sessionId}, order=${order.id}): ${reason}`);
    }
  }

  private normalizePhone(value: string | null | undefined): string {
    return String(value ?? '')
      .split('@')[0]
      .split(':')[0]
      .replace(/\D/g, '')
      .replace(/^00/, '');
  }

  private samePhone(left: string, right: string): boolean {
    if (!left || !right) return false;
    if (left === right) return true;
    const comparableLength = Math.min(9, left.length, right.length);
    return comparableLength >= 8 && left.slice(-comparableLength) === right.slice(-comparableLength);
  }
}
