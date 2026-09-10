import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizePhone } from '../../../common/utils/phone.util';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { createLogger } from '../../../common/services/logger.service';
import { MessageService } from '../../message/message.service';
import { Order } from '../../stores/entities/order.entity';
import { Product } from '../../stores/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { CommerceAiToolExecutorService } from './commerce-ai-tool-executor.service';
import { CommerceToolService } from './commerce-tool.service';
import { CommerceVoiceService } from './commerce-voice.service';

export interface CatalogMessageIdentity {
  from?: string;
  chatId?: string;
  senderPhone?: string | null;
}

@Injectable()
export class CommerceCatalogConversationService {
  private readonly logger = createLogger('CommerceCatalogConversationService');
  constructor(
    private readonly ai: CommerceAiAgentService,
    private readonly encryption: CredentialEncryptionService,
    private readonly messages: MessageService,
    private readonly tools: CommerceToolService,
    private readonly executor: CommerceAiToolExecutorService,
    private readonly voice: CommerceVoiceService,
    @InjectRepository(Product, 'data') private readonly productRepository: Repository<Product>,
  ) {}

  async products(storeId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { storeId, status: 'active' },
      order: { externalUpdatedAt: 'DESC' },
      take: 40,
    });
  }

  relevant(products: Product[], text: string, order?: Order): Product[] {
    const terms = `${text} ${(order?.lineItems ?? []).map(item => this.scalar(item.title ?? item.name)).join(' ')}`
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(term => term.length > 2);
    const scored = products
      .map(product => {
        const value =
          `${product.title} ${product.productType ?? ''} ${product.vendor ?? ''} ${(product.tags ?? []).join(' ')}`.toLowerCase();
        return { product, score: terms.reduce((sum, term) => sum + (value.includes(term) ? 1 : 0), 0) };
      })
      .sort((left, right) => right.score - left.score);
    const matched = scored
      .filter(item => item.score > 0)
      .slice(0, 8)
      .map(item => item.product);
    return matched.length ? matched : scored.slice(0, 10).map(item => item.product);
  }

  isGeneralOrderQuery(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      /(?:orders?|commandes?|talabat|طلباتي|الطلبات)/i.test(normalized) &&
      /(?:all|list|show|give|mes|my|dyali|3ndi|عندي|ديالي|كل)/i.test(normalized)
    );
  }

  hasUnverifiedMutationClaim(text: string): boolean {
    return /(?:commande|order|طلب(?:ية)?)\s*(?:#?\w+\s*)?(?:a été|est|was|has been|تمت|راه|tqaddat)?\s*(?:cré[ée]e?|cree|created|confirm[ée]e?|confirmed|enregistr[ée]e?|saved|تأكد|تسجل|تسجلات)|(?:cré[ée]e?|cree|created|confirm[ée]e?|confirmed|enregistr[ée]e?|saved)\s+(?:la\s+|votre\s+|your\s+)?(?:commande|order)|(?:tqaddat|tsajlat|tconfirmat)\b/i.test(
      text,
    );
  }

  async handle(
    sessionId: string,
    store: Store,
    message: CatalogMessageIdentity,
    text: string,
    customerOrders: Order[] = [],
  ): Promise<void> {
    if (!this.ai.enabled()) return;
    const settings = this.encryption.revealSettings(store.settings ?? {});
    if (settings.catalogAssistantEnabled === false) return;
    const chatId = message.chatId ?? message.from;
    if (!chatId) return;
    let products: Product[] = [];
    try {
      const catalog = await this.products(store.id);
      products = this.tools.searchProducts(text, catalog, store.currency, 8).products;
      const history = await this.messages.getMessages(sessionId, { chatId, limit: 10 });
      const turns = history.messages
        .filter(item => item.type === 'text' && Boolean(item.body?.trim()))
        .reverse()
        .map(item => ({
          role: String(item.direction) === 'incoming' ? ('customer' as const) : ('assistant' as const),
          text: String(item.body).slice(0, 1000),
          at: item.createdAt?.toISOString?.() ?? new Date().toISOString(),
        }));
      if (!turns.length || turns.at(-1)?.role !== 'customer' || turns.at(-1)?.text !== text)
        turns.push({ role: 'customer', text: text.slice(0, 1000), at: new Date().toISOString() });
      const phone = normalizePhone(message.senderPhone ?? message.from ?? message.chatId);
      const answer = await this.ai.chatWithTools(
        turns,
        { name: store.name, language: store.language, products, orders: customerOrders },
        this.tools.definitions(),
        call => this.executor.execute(call.name, call.arguments, store, phone, catalog, customerOrders, text),
        sessionId,
      );
      const safe = this.hasUnverifiedMutationClaim(answer)
        ? this.fallback(text, products, customerOrders, store)
        : answer;
      await this.voice.sendReply(sessionId, { chatId, text: safe.slice(0, 1500) });
    } catch (error) {
      this.logger.error(
        `AI catalog reply failed (store=${store.id}): ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.voice.sendReply(sessionId, { chatId, text: this.fallback(text, products, customerOrders, store) });
    }
  }

  private fallback(text: string, products: Product[], orders: Order[], store: Store): string {
    const darija = /\b(?:salam|ch7al|chnou|chno|fin|bghit|wach|dyali|3ndi)\b|[\u0600-\u06ff]/i.test(text);
    if (this.isGeneralOrderQuery(text)) {
      if (!orders.length)
        return darija ? 'ما لقيت حتى طلب مربوط بهاد الرقم.' : 'Je n’ai trouvé aucune commande liée à votre numéro.';
      const lines = orders
        .slice(0, 5)
        .map(
          order =>
            `• ${order.orderNumber ?? order.externalOrderId} — ${order.totalPrice} ${order.currency} — ${order.status}`,
        )
        .join('\n');
      return `${darija ? 'هادو هما الطلبات ديالك:' : 'Voici vos commandes :'}\n${lines}`;
    }
    const matches = this.tools.searchProducts(text, products, store.currency, 5).products;
    if (/produit|catalog|article|شنو|اش عندكم|3ndkom/i.test(text) || matches.length) {
      const choices = (matches.length ? matches : products)
        .slice(0, 5)
        .map((product, index) => `${index + 1}. ${product.title} — ${product.price} ${store.currency}`)
        .join('\n');
      if (choices)
        return `${darija ? 'ها بعض المنتجات المتوفرة:' : 'Voici quelques produits disponibles :'}\n${choices}`;
    }
    return darija
      ? 'مرحبا 😊 قول ليا شنو بغيتي تعرف على المنتجات ولا الطلبات ديالك؟'
      : 'Bonjour 😊 Que souhaitez-vous savoir sur nos produits ou vos commandes ?';
  }

  private scalar(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}
