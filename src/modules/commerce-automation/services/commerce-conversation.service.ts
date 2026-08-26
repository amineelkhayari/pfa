import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../../core/hooks';
import { createLogger } from '../../../common/services/logger.service';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { MessageService } from '../../message/message.service';
import { Order } from '../../stores/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { Product } from '../../stores/entities/product.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { ShopifyService } from '../../shopify/services/shopify.service';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { CommerceAiAgentService } from './commerce-ai-agent.service';
import { StoreOrderCart } from '../../stores/entities/store-order-cart.entity';
import { WooCommerceService, WooCredentials } from '../../woocommerce/services/woocommerce.service';

interface IncomingReply {
  body?: string;
  from?: string;
  chatId?: string;
  senderPhone?: string | null;
  fromMe?: boolean;
}

@Injectable()
export class CommerceConversationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('CommerceConversationService');
  private hookId?: string;

  constructor(
    private readonly hooks: HookManager,
    private readonly shopify: ShopifyService,
    private readonly woocommerce: WooCommerceService,
    private readonly messages: MessageService,
    private readonly encryption: CredentialEncryptionService,
    private readonly ai: CommerceAiAgentService,
    @InjectRepository(Store, 'data') private readonly stores: Repository<Store>,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
    @InjectRepository(StoreOrderCart, 'data') private readonly carts: Repository<StoreOrderCart>,
  ) {}

  onModuleInit(): void {
    this.hookId = this.hooks.register(
      'commerce-order-assistant',
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
    if (!store?.settings || ![Platform.SHOPIFY, Platform.WOOCOMMERCE].includes(store.provider)) return;

    const sender = this.normalizePhone(message.senderPhone ?? message.from ?? message.chatId);
    if (!sender) return;
    const catalog = await this.storeProducts(store.id);
    const recentOrders = await this.orders.find({
      where: { storeId: store.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const customerOrders = recentOrders.filter(candidate => this.samePhone(sender, this.normalizePhone(candidate.phone)));
    // Looking up an existing order is never a request to create a new one. Previously the bare word
    // "order" started a cart before this distinction was made, trapping all later messages in the
    // numbered product menu.
    if (
      store.provider === Platform.SHOPIFY
      && !this.isGeneralOrderQuery(reply)
      && await this.handleNewOrder(sessionId, store, message, reply, sender, catalog, customerOrders)
    ) return;
    const pending = customerOrders.filter(candidate => candidate.confirmationStatus === 'pending');
    const referencedOrder = customerOrders.find(candidate => {
      const number = String(candidate.orderNumber ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      return number.length > 0 && reply.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(number);
    });
    if (referencedOrder && ['not_sent', 'failed'].includes(referencedOrder.confirmationStatus) && referencedOrder.status === 'open') {
      referencedOrder.confirmationStatus = 'pending';
      referencedOrder.confirmationError = null;
      await this.orders.save(referencedOrder);
    }
    const actionableReferenced = referencedOrder?.confirmationStatus === 'pending' ? referencedOrder : undefined;
    // A referenced completed/cancelled order is informational, never silently replaced with a
    // different pending order. Let the assistant explain its real current status.
    if (referencedOrder && !actionableReferenced) {
      await this.handleCatalogQuestion(sessionId, store, message, reply, customerOrders);
      return;
    }
    if (!referencedOrder && this.isGeneralOrderQuery(reply)) {
      await this.handleCatalogQuestion(sessionId, store, message, reply, customerOrders);
      return;
    }
    if (!pending.length && !actionableReferenced) {
      await this.handleCatalogQuestion(sessionId, store, message, reply, customerOrders);
      return;
    }
    if (pending.length > 1 && !actionableReferenced) {
      // Multiple pending orders should not turn the bot into a static menu. Normal greetings,
      // product questions and order enquiries still belong to the conversational assistant. Ask
      // the customer to choose an order only when they are attempting a state-changing action
      // without naming the order (or when AI is disabled and cannot disambiguate naturally).
      if (this.ai.enabled() && !this.hasOrderActionIntent(reply)) {
        await this.handleCatalogQuestion(sessionId, store, message, reply, customerOrders);
        return;
      }
      const chatId = message.chatId ?? message.from;
      if (chatId) {
        const choices = pending.slice(0, 5).map(candidate => `• ${candidate.orderNumber ?? candidate.shopifyOrderId} — ${candidate.totalPrice} ${candidate.currency}`).join('\n');
        await this.messages.sendText(sessionId, { chatId, text: `Vous avez plusieurs commandes en attente. Indiquez le numéro de la commande concernée :\n${choices}` });
      }
      return;
    }
    const order = actionableReferenced ?? pending[0];
    if (!order) return;

    const directAction = reply === '1' ? 'confirm' : reply === '2' ? 'cancel' : this.directOrderAction(reply);
    if (!directAction) {
      if (this.ai.enabled()) await this.handleAiReply(sessionId, store, order, message, reply);
      return;
    }

    order.confirmationStatus = 'processing_reply';
    order.confirmationError = null;
    await this.orders.save(order);

    try {
      const settings = this.encryption.revealSettings(store.settings);
      if (directAction === 'confirm') {
        await this.updateProviderOrder(store, settings, order, 'confirm');
        order.status = 'confirmed';
        order.confirmationStatus = 'confirmed';
      } else {
        await this.updateProviderOrder(store, settings, order, 'cancel');
        order.status = 'cancelled';
        order.confirmationStatus = 'cancelled';
      }
      await this.orders.save(order);

      const chatId = message.chatId ?? message.from;
      if (chatId) {
        await this.messages.sendText(sessionId, {
          chatId,
          text:
            directAction === 'confirm'
              ? await this.confirmationMessage(store, order)
              : `Votre commande ${order.orderNumber ?? ''} a été annulée.`,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to process the order reply.';
      order.confirmationStatus = 'pending';
      order.confirmationError = reason;
      await this.orders.save(order);
      this.logger.error(`Failed to process ${store.provider} order reply (session=${sessionId}, order=${order.id}): ${reason}`);
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
    conversation ??= this.conversations.create({
      orderId: order.id,
      storeId: store.id,
      status: 'active',
      turnCount: 0,
      turns: [],
    });
    const turns = [...(conversation.turns ?? []), { role: 'customer' as const, text: customerText.slice(0, 1000), at: new Date().toISOString() }];
    const chatId = message.chatId ?? message.from;
    if (!chatId) return;
    if (conversation.status === 'escalated') return;
    const timeoutHours = this.ai.timeoutHours();
    if (conversation.createdAt && Date.now() - new Date(conversation.updatedAt).getTime() > timeoutHours * 60 * 60 * 1000) {
      conversation.status = 'expired';
      conversation.turns = [...turns, { role: 'assistant', text: 'Cette conversation a expiré. Un conseiller va reprendre votre demande.', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.messages.sendText(sessionId, { chatId, text: 'Cette conversation a expiré. Un conseiller va reprendre votre demande.' });
      return;
    }
    const maxTurns = this.ai.maxTurns();
    if (conversation.turnCount >= maxTurns) {
      conversation.status = 'escalated';
      conversation.turns = [...turns, { role: 'assistant', text: 'Un conseiller va reprendre cette conversation.', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.messages.sendText(sessionId, { chatId, text: 'Un conseiller va reprendre cette conversation.' });
      return;
    }
    try {
      const catalog = this.relevantProducts(await this.storeProducts(store.id), customerText, order);
      const decision = await this.ai.respond(order, store.language, turns.slice(-8), { name: store.name, products: catalog });
      conversation.turnCount = (conversation.turnCount ?? 0) + 1;
      conversation.turns = [...turns, { role: 'assistant', text: decision.reply, at: new Date().toISOString() }];
      conversation.lastError = null;
      if (decision.action === 'escalate') conversation.status = 'escalated';
      if (decision.action === 'confirm' || decision.action === 'cancel') {
        const settings = this.encryption.revealSettings(store.settings ?? {});
        order.confirmationStatus = 'processing_reply';
        await this.orders.save(order);
        if (decision.action === 'confirm') {
          await this.updateProviderOrder(store, settings, order, 'confirm');
          order.status = 'confirmed'; order.confirmationStatus = 'confirmed'; conversation.status = 'confirmed';
        } else {
          await this.updateProviderOrder(store, settings, order, 'cancel');
          order.status = 'cancelled'; order.confirmationStatus = 'cancelled'; conversation.status = 'cancelled';
        }
        await this.orders.save(order);
      }
      await this.conversations.save(conversation);
      const text = decision.action === 'confirm'
        ? await this.confirmationMessage(store, order, decision.reply)
        : decision.reply;
      await this.messages.sendText(sessionId, { chatId, text });
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

  private async updateProviderOrder(store: Store, settings: Record<string, any>, order: Order, action: 'confirm' | 'cancel'): Promise<void> {
    if (store.provider === Platform.WOOCOMMERCE) {
      const credentials = settings as WooCredentials;
      if (!credentials.siteUrl || !credentials.consumerKey || !credentials.consumerSecret) throw new Error('WooCommerce connection is not configured.');
      if (action === 'confirm') await this.woocommerce.confirmOrder(credentials, order.shopifyOrderId);
      else await this.woocommerce.cancelOrder(credentials, order.shopifyOrderId);
      return;
    }
    const shopDomain = typeof settings.shopDomain === 'string' ? settings.shopDomain : '';
    const accessToken = typeof settings.accessToken === 'string' ? settings.accessToken : '';
    if (!shopDomain || !accessToken) throw new Error('Shopify connection is not configured.');
    if (action === 'confirm') await this.shopify.markOrderConfirmed(shopDomain, accessToken, order);
    else await this.shopify.cancelOrder(shopDomain, accessToken, order.shopifyOrderId);
  }

  private async handleCatalogQuestion(sessionId: string, store: Store, message: IncomingReply, text: string, customerOrders: Order[] = []): Promise<void> {
    if (!this.ai.enabled()) return;
    const settings = this.encryption.revealSettings(store.settings ?? {});
    if (settings.catalogAssistantEnabled === false) return;
    const chatId = message.chatId ?? message.from;
    if (!chatId) return;
    try {
      const products = this.relevantProducts(await this.storeProducts(store.id), text);
      const history = await this.messages.getMessages(sessionId, { chatId, limit: 10 });
      const turns = history.messages
        .filter(item => item.type === 'text' && Boolean(item.body?.trim()))
        .reverse()
        .map(item => ({
          role: item.direction === 'incoming' ? 'customer' as const : 'assistant' as const,
          text: String(item.body).slice(0, 1000),
          at: item.createdAt?.toISOString?.() ?? new Date().toISOString(),
        }));
      if (!turns.length || turns[turns.length - 1].role !== 'customer' || turns[turns.length - 1].text !== text) {
        turns.push({ role: 'customer', text: text.slice(0, 1000), at: new Date().toISOString() });
      }
      const answer = await this.ai.chat(
        turns,
        { name: store.name, language: store.language, products, orders: customerOrders },
      );
      await this.messages.sendText(sessionId, { chatId, text: answer.slice(0, 1500) });
    } catch (error) {
      this.logger.error(`AI catalog reply failed (store=${store.id}): ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private async storeProducts(storeId: string): Promise<Product[]> {
    return this.products.find({ where: { storeId, status: 'active' }, order: { shopifyUpdatedAt: 'DESC' }, take: 40 });
  }

  private relevantProducts(products: Product[], text: string, order?: Order): Product[] {
    const terms = `${text} ${(order?.lineItems ?? []).map(item => item.title ?? item.name ?? '').join(' ')}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
    const scored = products.map(product => {
      const haystack = `${product.title} ${product.productType ?? ''} ${product.vendor ?? ''} ${(product.tags ?? []).join(' ')}`.toLowerCase();
      return { product, score: terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) };
    }).sort((a, b) => b.score - a.score);
    const matched = scored.filter(item => item.score > 0).slice(0, 8).map(item => item.product);
    return matched.length ? matched : scored.slice(0, 10).map(item => item.product);
  }

  private async handleNewOrder(
    sessionId: string,
    store: Store,
    message: IncomingReply,
    text: string,
    phone: string,
    products: Product[],
    customerOrders: Order[],
  ): Promise<boolean> {
    const chatId = message.chatId ?? message.from;
    if (!chatId) return false;
    let cart = await this.carts.findOneBy({ storeId: store.id, phone });
    if (!cart && !this.hasPurchaseIntent(text)) return false;
    cart ??= this.carts.create({ storeId: store.id, phone, step: 'product', quantity: 1, country: 'Morocco' });
    const cancel = /\b(cancel|annul|stop|ncancel|ma bghit|la ma bghitch)\w*\b|إلغاء|الغاء|لا أريد/i.test(text);
    if (cancel) {
      if (cart.id) await this.carts.delete(cart.id);
      await this.messages.sendText(sessionId, { chatId, text: 'D’accord, la nouvelle commande a été annulée.' });
      return true;
    }
    if (cart.step === 'product') {
      const selectedNumber = this.choiceNumber(text, products.length);
      let product = selectedNumber ? products[selectedNumber - 1] : this.matchProduct(text, products);
      // Darija often refers back to the previously discussed product ("bghit nakhdo" / "بغيت
      // ناخدو") without repeating its long catalog name. Resolve that reference only when one
      // unique product was mentioned in a recent message; never guess from a multi-product list.
      if (!product && this.hasReferentialPurchaseIntent(text)) {
        product = await this.recentlyMentionedProduct(sessionId, chatId, products);
      }
      if (!product) {
        await this.carts.save(cart);
        if (this.ai.enabled()) {
          await this.handleCatalogQuestion(sessionId, store, message, text, customerOrders);
          return true;
        }
        const choices = products.slice(0, 10).map((item, index) => `${index + 1}. ${item.title} — ${item.price} ${store.currency}`).join('\n');
        await this.messages.sendText(sessionId, { chatId, text: `Quel produit souhaitez-vous commander ? Répondez avec le numéro :\n${choices}` });
        return true;
      }
      cart.productId = product.id;
      const variants = product.variants ?? [];
      if (variants.length > 1) {
        cart.step = 'variant'; await this.carts.save(cart);
        await this.messages.sendText(sessionId, { chatId, text: `Choisissez une option pour ${product.title}. Répondez avec le numéro :\n${variants.slice(0, 10).map((item, index) => `${index + 1}. ${item.title} — ${item.price ?? product.price} ${store.currency}`).join('\n')}` });
      } else {
        const variant = variants[0];
        cart.variantId = String(variant?.admin_graphql_api_id ?? (variant?.id ? `gid://shopify/ProductVariant/${variant.id}` : ''));
        cart.variantTitle = String(variant?.title ?? 'Default Title'); cart.step = 'quantity'; await this.carts.save(cart);
        await this.messages.sendText(sessionId, { chatId, text: `Combien d’unités de ${product.title} souhaitez-vous ?` });
      }
      return true;
    }
    const product = products.find(item => item.id === cart.productId);
    if (!product) { await this.carts.delete(cart.id); return false; }
    if (cart.step === 'variant') {
      const variants = product.variants ?? [];
      const selectedNumber = this.choiceNumber(text, variants.length);
      const variant = selectedNumber ? variants[selectedNumber - 1] : variants.find(item => text.toLowerCase().includes(String(item.title ?? '').toLowerCase()));
      if (!variant) { await this.messages.sendText(sessionId, { chatId, text: `Je n’ai pas reconnu l’option. Répondez avec un numéro :\n${variants.slice(0, 10).map((item, index) => `${index + 1}. ${item.title}`).join('\n')}` }); return true; }
      cart.variantId = String(variant.admin_graphql_api_id ?? `gid://shopify/ProductVariant/${variant.id}`); cart.variantTitle = String(variant.title); cart.step = 'quantity'; await this.carts.save(cart);
      await this.messages.sendText(sessionId, { chatId, text: 'Quelle quantité souhaitez-vous ?' }); return true;
    }
    if (cart.step === 'quantity') {
      const affirmative = /^(?:yes|oui|نعم|اه|آه|wakha|واخا)$/i.test(text.trim());
      const quantity = affirmative ? 1 : Number(text.match(/\d+/)?.[0]);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) { await this.messages.sendText(sessionId, { chatId, text: 'Indiquez une quantité entre 1 et 99.' }); return true; }
      cart.quantity = quantity; cart.step = 'name'; await this.carts.save(cart);
      await this.messages.sendText(sessionId, { chatId, text: 'Quel est votre nom complet pour la livraison ?' }); return true;
    }
    if (cart.step === 'name') { cart.customerName = text.slice(0, 150); cart.step = 'address'; await this.carts.save(cart); await this.messages.sendText(sessionId, { chatId, text: 'Quelle est votre adresse de livraison (rue, numéro et quartier) ?' }); return true; }
    if (cart.step === 'address') { cart.address1 = text.slice(0, 300); cart.step = 'city'; await this.carts.save(cart); await this.messages.sendText(sessionId, { chatId, text: 'Dans quelle ville ?' }); return true; }
    if (cart.step === 'city') {
      cart.city = text.slice(0, 100); cart.step = 'confirm'; await this.carts.save(cart);
      const variant = (product.variants ?? []).find(item => String(item.admin_graphql_api_id ?? `gid://shopify/ProductVariant/${item.id}`) === cart.variantId);
      const unitPrice = Number(variant?.price ?? product.price);
      const summary = `Résumé de votre nouvelle commande :\n• ${product.title}${cart.variantTitle && cart.variantTitle !== 'Default Title' ? ` — ${cart.variantTitle}` : ''}\n• Quantité : ${cart.quantity}\n• Total produits : ${(unitPrice * cart.quantity).toFixed(2)} ${store.currency}\n• Livraison : ${cart.customerName}, ${cart.address1}, ${cart.city}\n• Téléphone : +${phone}`;
      await this.messages.sendText(sessionId, {
        chatId,
        text: `${summary}\n\n✅ Répondez *CONFIRMER* pour créer la commande.\n❌ Répondez *ANNULER* pour arrêter.`,
      });
      return true;
    }
    if (cart.step === 'confirm') {
      if (!/\b(confirm|confirmer|confirme|nconfirm|yes|oui|wakha)\w*\b|تأكيد|أؤكد|اؤكد|نعم/i.test(text)) { await this.messages.sendText(sessionId, { chatId, text: 'Répondez CONFIRMER pour créer la commande, ou ANNULER pour arrêter.' }); return true; }
      const settings = this.encryption.revealSettings(store.settings ?? {});
      try {
        const result = await this.shopify.createConfirmedChatOrder(String(settings.shopDomain ?? ''), String(settings.accessToken ?? ''), {
          variantId: String(cart.variantId), quantity: cart.quantity, phone: `+${phone}`, customerName: String(cart.customerName), address1: String(cart.address1), city: String(cart.city), postalCode: cart.postalCode, country: cart.country,
        });
        await this.carts.delete(cart.id);
        await this.messages.sendText(sessionId, { chatId, text: `Votre commande ${result.orderName ?? ''} a été créée et confirmée avec succès ✅` });
      } catch (error) {
        this.logger.error(`Chat order creation failed (store=${store.id}, customer=${phone.slice(-4)}): ${error instanceof Error ? error.message : 'unknown error'}`);
        await this.messages.sendText(sessionId, { chatId, text: 'Je n’ai pas pu créer la commande dans Shopify pour le moment. Vos informations sont conservées; répondez CONFIRMER pour réessayer ou ANNULER.' });
      }
      return true;
    }
    return false;
  }

  private hasPurchaseIntent(text: string): boolean {
    // Require a clear creation/buying verb. A bare "order/commande/طلب" is commonly an existing
    // order enquiry and must remain conversational.
    return /\b(?:buy|purchase|commander|acheter|achete|nchri|nakhod|nakhdo|nakhdoh|ncommandi)\b|\b(?:i want|i need|want to|would like to)\s+(?:buy|purchase|order)\b|\b(?:je veux|je voudrais)\s+(?:commander|acheter)\b|\bbghit\s+(?:nchri|nakhod|nakhdo|nakhdoh|ncommandi)\b|(?:بغيت|أريد)\s+(?:نشتري|نطلب|شراء|ناخد|ناخدو|ناخذه)/i.test(text);
  }

  private hasReferentialPurchaseIntent(text: string): boolean {
    return /\b(?:nakhod|nakhdo|nakhdoh|take it|buy it|this one)\b|(?:ناخد|ناخدو|ناخذه|هذا|هادا)/i.test(text);
  }

  private async recentlyMentionedProduct(sessionId: string, chatId: string, products: Product[]): Promise<Product | undefined> {
    const history = await this.messages.getMessages(sessionId, { chatId, limit: 10 });
    for (const message of history.messages) {
      const body = String(message.body ?? '').toLowerCase();
      const matches = products.filter(product => body.includes(product.title.toLowerCase()));
      if (matches.length === 1) return matches[0];
    }
    return undefined;
  }

  private matchProduct(text: string, products: Product[]): Product | undefined {
    const normalized = text.toLowerCase();
    const exact = [...products].sort((a, b) => b.title.length - a.title.length).find(product => normalized.includes(product.title.toLowerCase()));
    if (exact) return exact;
    const terms = normalized.split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
    const ranked = products.map(product => ({ product, score: terms.filter(term => product.title.toLowerCase().includes(term)).length })).sort((a, b) => b.score - a.score);
    return ranked[0]?.score > 0 && ranked[0].score > (ranked[1]?.score ?? -1) ? ranked[0].product : undefined;
  }

  private choiceNumber(text: string, maximum: number): number | null {
    const match = text.trim().match(/^(?:option\s*)?(\d{1,2})[.)]?$/i);
    if (!match) return null;
    const value = Number(match[1]);
    return value >= 1 && value <= Math.min(maximum, 10) ? value : null;
  }

  private async confirmationMessage(store: Store, order: Order, aiReply?: string): Promise<string> {
    const settings = this.encryption.revealSettings(store.settings ?? {});
    const confirmationTemplate = typeof settings.confirmationSuccessTemplate === 'string' && settings.confirmationSuccessTemplate.trim()
      ? settings.confirmationSuccessTemplate
      : 'Merci {{customerName}}, votre commande {{orderNumber}} est confirmée ✅';
    const base = aiReply?.trim() || this.renderTemplate(confirmationTemplate, {
      customerName: order.customerName ?? '', orderNumber: order.orderNumber ?? order.shopifyOrderId, storeName: store.name,
    });
    const related = this.relatedProducts(order, await this.storeProducts(store.id));
    if (!related.length) return base;
    const lines = related.map(product => `• ${product.title} — ${product.price} ${order.currency || store.currency}`).join('\n');
    const recommendationTemplate = typeof settings.relatedProductsTemplate === 'string' && settings.relatedProductsTemplate.trim()
      ? settings.relatedProductsTemplate
      : 'Vous pourriez aussi aimer :\n{{products}}\n\nRépondez avec le nom du produit pour plus d’informations.';
    return `${base}\n\n${this.renderTemplate(recommendationTemplate, { products: lines, storeName: store.name, orderNumber: order.orderNumber ?? order.shopifyOrderId })}`;
  }

  private relatedProducts(order: Order, products: Product[]): Product[] {
    const orderedTitles = new Set((order.lineItems ?? []).map(item => String(item.title ?? item.name ?? '').trim().toLowerCase()).filter(Boolean));
    const orderedProducts = products.filter(product => orderedTitles.has(product.title.trim().toLowerCase()));
    const tags = new Set(orderedProducts.flatMap(product => product.tags ?? []).map(tag => tag.toLowerCase()));
    return products
      .filter(product => !orderedTitles.has(product.title.trim().toLowerCase()))
      .map(product => ({ product, score:
        (orderedProducts.some(source => source.productType && source.productType === product.productType) ? 3 : 0)
        + (orderedProducts.some(source => source.vendor && source.vendor === product.vendor) ? 2 : 0)
        + (product.tags ?? []).filter(tag => tags.has(tag.toLowerCase())).length,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(item => item.product);
  }

  private renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (match, key: string) => values[key] ?? match).trim();
  }

  private isGeneralOrderQuery(text: string): boolean {
    const normalized = text.toLowerCase();
    return /(?:orders?|commandes?|talabat|طلباتي|الطلبات)/i.test(normalized)
      && /(?:all|list|show|give|mes|my|dyali|3ndi|عندي|ديالي|كل)/i.test(normalized);
  }

  private hasOrderActionIntent(text: string): boolean {
    const normalized = text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
    if (normalized === '1' || normalized === '2') return true;
    return /\b(confirm|confirmed|confirmer|confirme|cancel|cancelled|annul|annuler|annule|ma bghit|la ma bghitch)\w*\b|تأكيد|أؤكد|اؤكد|إلغاء|الغاء|ألغي|لا أريد/.test(normalized);
  }

  /** Strong, explicit mutations bypass AI formatting/escalation and execute deterministically. */
  private directOrderAction(text: string): 'confirm' | 'cancel' | null {
    const normalized = text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
    const cancel = /\b(?:cancel|cancelled|annuler|annule|je veux annuler|bghit ncancel|ma bghit|la ma bghitch)\w*\b|إلغاء|الغاء|ألغي|لا أريد/.test(normalized);
    if (cancel) return 'cancel';
    const confirm = /\b(?:confirm|confirmed|confirmer|confirme|je confirme|yes confirm|oui je confirme|bghit nconfirm|wakha confirm)\w*\b|أؤكد|اؤكد|تأكيد|نعم أؤكد/.test(normalized);
    return confirm ? 'confirm' : null;
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
