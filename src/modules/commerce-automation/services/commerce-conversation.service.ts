import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../../core/hooks';
import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { isSamePhone, normalizePhone } from '../../../common/utils/phone.util';
import { CommerceVoiceService } from './commerce-voice.service';
import { CommerceCartConversationService } from './commerce-cart-conversation.service';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { CommerceCatalogConversationService } from './commerce-catalog-conversation.service';
import { CommerceAiOrderConversationService } from './commerce-ai-order-conversation.service';
import { CommerceOrderRoutingService } from './commerce-order-routing.service';
import { CommerceMessageIdempotencyService } from './commerce-message-idempotency.service';

interface IncomingReply {
  id?: string;
  messageId?: string;
  body?: string;
  type?: string;
  media?: { mimetype?: string; filename?: string; data?: string; omitted?: boolean };
  from?: string;
  chatId?: string;
  senderPhone?: string | null;
  fromMe?: boolean;
}

@Injectable()
export class CommerceConversationService implements OnModuleInit, OnModuleDestroy {
  private hookId?: string;

  constructor(
    private readonly hooks: HookManager,
    private readonly ai: CommerceAiAgentService,
    private readonly voice: CommerceVoiceService,
    private readonly cartConversation: CommerceCartConversationService,
    private readonly orderActions: CommerceOrderActionService,
    private readonly catalogConversation: CommerceCatalogConversationService,
    private readonly aiOrderConversation: CommerceAiOrderConversationService,
    private readonly orderRouting: CommerceOrderRoutingService,
    private readonly messageIdempotency: CommerceMessageIdempotencyService,
    @InjectRepository(Store, 'data') private readonly stores: Repository<Store>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
  ) {}

  onModuleInit(): void {
    this.hookId = this.hooks.register(
      'commerce-order-assistant',
      'message:received',
      async context => {
        const message = context.data as IncomingReply;
        const sessionId = context.sessionId;
        const messageId = message.id ?? message.messageId;
        if (!sessionId || !(await this.messageIdempotency.claim(sessionId, messageId)))
          return { continue: true, data: context.data };
        try {
          await this.handleReply(sessionId, message);
          await this.messageIdempotency.complete(sessionId, messageId);
        } catch (error) {
          await this.messageIdempotency.release(sessionId, messageId);
          throw error;
        }
        return { continue: true, data: context.data };
      },
      20,
    );
  }

  onModuleDestroy(): void {
    if (this.hookId) this.hooks.unregister(this.hookId);
  }

  private async handleReply(sessionId: string | undefined, message: IncomingReply): Promise<void> {
    if (!sessionId || message.fromMe) return;
    const chatId = message.chatId ?? message.from;
    const isAudio = message.type === 'voice' || message.type === 'audio';
    let reply = message.body?.trim();
    if (isAudio) {
      const audioStore = await this.stores.findOneBy({ sessionId });
      if (
        !audioStore?.settings ||
        ![Platform.SHOPIFY, Platform.WOOCOMMERCE, Platform.YOUCAN].includes(audioStore.provider)
      )
        return;
      reply = await this.voice.transcribeIncoming(sessionId, chatId, message.media, audioStore.language);
    }
    if (!reply) return;
    if (isAudio && chatId) {
      await this.voice.withAudioReply(chatId, () => this.handleTranscribedReply(sessionId, message, reply));
      return;
    }
    await this.handleTranscribedReply(sessionId, message, reply);
  }

  private async handleTranscribedReply(sessionId: string, message: IncomingReply, reply: string): Promise<void> {
    const store = await this.stores.findOneBy({ sessionId });
    if (!store?.settings || ![Platform.SHOPIFY, Platform.WOOCOMMERCE, Platform.YOUCAN].includes(store.provider)) return;

    const sender = normalizePhone(message.senderPhone ?? message.from ?? message.chatId);
    if (!sender) return;
    const catalog = await this.catalogConversation.products(store.id);
    const recentOrders = await this.orders.find({
      where: { storeId: store.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const customerOrders = recentOrders.filter(candidate => isSamePhone(sender, candidate.phone));
    const preparedEdit = await this.orderRouting.pendingAddressEdit(customerOrders);
    if (preparedEdit && this.orderRouting.isPendingEditDecision(reply)) {
      const chatId = message.chatId ?? message.from;
      if (chatId) {
        const turns = [
          ...(preparedEdit.conversation.turns ?? []),
          { role: 'customer' as const, text: reply.slice(0, 1000), at: new Date().toISOString() },
        ];
        if (
          await this.orderActions.handlePendingEdit(
            sessionId,
            chatId,
            store,
            preparedEdit.order,
            preparedEdit.conversation,
            reply,
            turns,
          )
        )
          return;
      }
    }
    // Looking up an existing order is never a request to create a new one. Previously the bare word
    // "order" started a cart before this distinction was made, trapping all later messages in the
    // numbered product menu.
    const productSelectionIntent = this.cartConversation.hasProductSelectionIntent(reply, catalog);
    const chatId = message.chatId ?? message.from;
    const cartResult =
      chatId && !this.catalogConversation.isGeneralOrderQuery(reply)
        ? await this.cartConversation.handle({
            sessionId,
            chatId,
            store,
            text: reply,
            phone: sender,
            products: catalog,
            forceStart: productSelectionIntent,
            catalogAssistantEnabled: this.ai.enabled(),
            messageId: message.id ?? message.messageId,
          })
        : 'not_handled';
    if (cartResult !== 'not_handled') {
      if (cartResult === 'catalog_assistance') {
        await this.catalogConversation.handle(sessionId, store, message, reply, customerOrders);
      }
      return;
    }
    const { pending, referencedOrder, actionableOrder } = await this.orderRouting.resolve(customerOrders, reply);
    // A referenced completed/cancelled order is informational, never silently replaced with a
    // different pending order. Let the assistant explain its real current status.
    if (referencedOrder && !actionableOrder) {
      await this.catalogConversation.handle(sessionId, store, message, reply, customerOrders);
      return;
    }
    if (!referencedOrder && this.catalogConversation.isGeneralOrderQuery(reply)) {
      await this.catalogConversation.handle(sessionId, store, message, reply, customerOrders);
      return;
    }
    if (!pending.length && !actionableOrder) {
      await this.catalogConversation.handle(sessionId, store, message, reply, customerOrders);
      return;
    }
    if (pending.length > 1 && !actionableOrder) {
      // Multiple pending orders should not turn the bot into a static menu. Normal greetings,
      // product questions and order enquiries still belong to the conversational assistant. Ask
      // the customer to choose an order only when they are attempting a state-changing action
      // without naming the order (or when AI is disabled and cannot disambiguate naturally).
      if (!this.orderRouting.shouldRequestOrderNumber(pending.length, this.ai.enabled(), reply)) {
        await this.catalogConversation.handle(sessionId, store, message, reply, customerOrders);
        return;
      }
      const chatId = message.chatId ?? message.from;
      if (chatId) {
        await this.sendReply(sessionId, {
          chatId,
          text: this.orderRouting.pendingChoices(pending),
        });
      }
      return;
    }
    const order = actionableOrder ?? pending[0];
    if (!order) return;

    const directAction = this.orderActions.directAction(reply);
    if (!directAction) {
      if (this.ai.enabled() && chatId) await this.aiOrderConversation.handle(sessionId, chatId, store, order, reply);
      return;
    }

    if (chatId) await this.orderActions.executeDirect(sessionId, chatId, store, order, directAction);
  }

  private async sendReply(sessionId: string, dto: { chatId: string; text: string }) {
    return this.voice.sendReply(sessionId, dto);
  }
}
