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
import { OrderAiConversation } from '../entities/order-ai-conversation.entity';
import { OpenAiOrderAgentService } from './openai-order-agent.service';

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
    private readonly ai: OpenAiOrderAgentService,
    @InjectRepository(Store, 'data') private readonly stores: Repository<Store>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
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
    if (!sessionId || message.fromMe || !reply) return;

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

    if (reply !== '1' && reply !== '2') {
      if (this.ai.enabled()) await this.handleAiReply(sessionId, store, order, message, reply);
      return;
    }

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

  private async handleAiReply(
    sessionId: string,
    store: Store,
    order: Order,
    message: IncomingReply,
    customerText: string,
  ): Promise<void> {
    let conversation = await this.conversations.findOneBy({ orderId: order.id });
    conversation ??= this.conversations.create({ orderId: order.id, storeId: store.id, status: 'active', turns: [] });
    const turns = [...(conversation.turns ?? []), { role: 'customer' as const, text: customerText.slice(0, 1000), at: new Date().toISOString() }];
    const chatId = message.chatId ?? message.from;
    if (!chatId) return;
    if (conversation.turnCount >= 8) {
      conversation.status = 'escalated';
      conversation.turns = [...turns, { role: 'assistant', text: 'Un conseiller va reprendre cette conversation.', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.messages.sendText(sessionId, { chatId, text: 'Un conseiller va reprendre cette conversation.' });
      return;
    }
    try {
      const decision = await this.ai.respond(order, store.language, turns);
      conversation.turnCount += 1;
      conversation.turns = [...turns, { role: 'assistant', text: decision.reply, at: new Date().toISOString() }];
      conversation.lastError = null;
      if (decision.action === 'escalate') conversation.status = 'escalated';
      if (decision.action === 'confirm' || decision.action === 'cancel') {
        const settings = this.encryption.revealSettings(store.settings ?? {});
        const shopDomain = typeof settings.shopDomain === 'string' ? settings.shopDomain : '';
        const accessToken = typeof settings.accessToken === 'string' ? settings.accessToken : '';
        if (!shopDomain || !accessToken) throw new Error('Shopify connection is not configured.');
        order.confirmationStatus = 'processing_reply';
        await this.orders.save(order);
        if (decision.action === 'confirm') {
          await this.shopify.markOrderConfirmed(shopDomain, accessToken, order);
          order.status = 'confirmed'; order.confirmationStatus = 'confirmed'; conversation.status = 'confirmed';
        } else {
          await this.shopify.cancelOrder(shopDomain, accessToken, order.shopifyOrderId);
          order.status = 'cancelled'; order.confirmationStatus = 'cancelled'; conversation.status = 'cancelled';
        }
        await this.orders.save(order);
      }
      await this.conversations.save(conversation);
      await this.messages.sendText(sessionId, { chatId, text: decision.reply });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'AI conversation failed';
      conversation.lastError = reason;
      conversation.turns = turns;
      await this.conversations.save(conversation);
      if (order.confirmationStatus === 'processing_reply') {
        order.confirmationStatus = 'pending'; order.confirmationError = reason; await this.orders.save(order);
      }
      this.logger.error(`AI order reply failed (order=${order.id}): ${reason}`);
      await this.messages.sendText(sessionId, { chatId, text: 'Je transfère votre demande à un conseiller. Votre commande reste en attente.' });
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
