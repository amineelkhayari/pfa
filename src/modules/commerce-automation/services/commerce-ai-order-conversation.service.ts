import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createLogger } from '../../../common/services/logger.service';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { CommerceCatalogConversationService } from './commerce-catalog-conversation.service';
import { CommerceOrderActionService } from './commerce-order-action.service';
import { CommerceVoiceService } from './commerce-voice.service';

@Injectable()
export class CommerceAiOrderConversationService {
  private readonly logger = createLogger('CommerceAiOrderConversationService');
  constructor(
    private readonly ai: CommerceAiAgentService,
    private readonly catalog: CommerceCatalogConversationService,
    private readonly actions: CommerceOrderActionService,
    private readonly voice: CommerceVoiceService,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
  ) {}

  async handle(sessionId: string, chatId: string, store: Store, order: Order, customerText: string): Promise<void> {
    let conversation = await this.conversations.findOneBy({ orderId: order.id });
    conversation ??= this.conversations.create({
      orderId: order.id,
      storeId: store.id,
      status: 'active',
      turnCount: 0,
      turns: [],
    });
    const turns = [
      ...(conversation.turns ?? []),
      { role: 'customer' as const, text: customerText.slice(0, 1000), at: new Date().toISOString() },
    ];
    if (conversation.status === 'escalated') return;
    if (await this.actions.handlePendingEdit(sessionId, chatId, store, order, conversation, customerText, turns))
      return;
    if (this.actions.hasAddressChangeIntent(customerText)) {
      await this.actions.startAddressChange(conversation, turns, sessionId, chatId);
      return;
    }
    if (
      conversation.createdAt &&
      Date.now() - new Date(conversation.updatedAt).getTime() > this.ai.timeoutHours() * 3_600_000
    ) {
      await this.close(
        conversation,
        turns,
        sessionId,
        chatId,
        'expired',
        'Cette conversation a expiré. Un conseiller va reprendre votre demande.',
      );
      return;
    }
    if (conversation.turnCount >= this.ai.maxTurns()) {
      await this.close(
        conversation,
        turns,
        sessionId,
        chatId,
        'escalated',
        'Un conseiller va reprendre cette conversation.',
      );
      return;
    }
    try {
      const products = this.catalog.relevant(await this.catalog.products(store.id), customerText, order);
      const decision = await this.ai.respond(
        order,
        store.language,
        turns.slice(-8),
        { name: store.name, products },
        sessionId,
      );
      conversation.turnCount = (conversation.turnCount ?? 0) + 1;
      conversation.turns = [...turns, { role: 'assistant', text: decision.reply, at: new Date().toISOString() }];
      conversation.lastError = null;
      if (decision.action === 'escalate') conversation.status = 'escalated';
      if (decision.action === 'confirm' || decision.action === 'cancel') {
        await this.actions.apply(store, order, decision.action);
        conversation.status = decision.action === 'confirm' ? 'confirmed' : 'cancelled';
      }
      await this.conversations.save(conversation);
      const safe =
        decision.action === 'continue' && this.catalog.hasUnverifiedMutationClaim(decision.reply)
          ? this.fallback(customerText, order)
          : decision.reply;
      const response =
        decision.action === 'confirm' ? await this.actions.confirmationMessage(store, order, decision.reply) : safe;
      await this.voice.sendReply(sessionId, { chatId, text: response });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'AI conversation failed';
      const mutationFailed = order.confirmationStatus === 'processing_reply';
      conversation.lastError = reason;
      conversation.turns = turns;
      await this.conversations.save(conversation);
      if (mutationFailed) {
        order.confirmationStatus = 'pending';
        order.confirmationError = reason;
        await this.orders.save(order);
      }
      this.logger.error(`AI order reply failed (order=${order.id}): ${reason}`);
      const text = mutationFailed
        ? `Je n’ai pas pu mettre à jour la commande ${order.orderNumber ?? order.externalOrderId} pour le moment. Elle reste en attente; vous pouvez réessayer dans un instant.`
        : this.fallback(customerText, order);
      await this.voice.sendReply(sessionId, { chatId, text });
    }
  }

  private async close(
    conversation: OrderAiConversation,
    turns: NonNullable<OrderAiConversation['turns']>,
    sessionId: string,
    chatId: string,
    status: string,
    text: string,
  ) {
    conversation.status = status;
    conversation.turns = [...turns, { role: 'assistant', text, at: new Date().toISOString() }];
    await this.conversations.save(conversation);
    await this.voice.sendReply(sessionId, { chatId, text });
  }

  private fallback(text: string, order: Order): string {
    const reference = order.orderNumber ?? order.externalOrderId;
    const darija = /\b(?:salam|ch7al|chnou|chno|fin|bghit|wach|dyali|3ndi)\b|[\u0600-\u06ff]/i.test(text);
    const items = (order.lineItems ?? [])
      .map(item => `${item.quantity ?? 1}× ${item.title ?? item.name ?? 'produit'}`)
      .join(', ');
    if (/total|price|prix|montant|ch7al|ثمن|المجموع/i.test(text))
      return darija
        ? `Total dyal commande ${reference} هو ${order.totalPrice} ${order.currency}.`
        : `Le total de la commande ${reference} est de ${order.totalPrice} ${order.currency}.`;
    if (/status|statut|état|etat|fin وصل|فين وصل|confirmation/i.test(text))
      return `Commande ${reference}: statut ${order.status}, confirmation ${order.confirmationStatus}.`;
    if (/produit|article|item|شنو|اش خديت|commande فيها/i.test(text) && items)
      return `Commande ${reference} فيها: ${items}.`;
    return darija
      ? `نقدر نعاونك فالطلب ${reference}. واش بغيتي تأكدها، تلغيها، ولا تسول على شي معلومة؟`
      : `Je peux vous aider avec la commande ${reference}. Souhaitez-vous la confirmer, l’annuler ou vérifier une information ?`;
  }
}
