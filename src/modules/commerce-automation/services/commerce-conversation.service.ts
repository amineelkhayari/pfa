import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { CommerceToolService } from './commerce-tool.service';
import { AudioTranscriptionService } from './audio-transcription.service';
import { PlanUsageService } from '../../auth/plan-usage.service';
import { YouCanCredentials, YouCanService } from '../../youcan/services/youcan.service';

interface IncomingReply {
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
  private readonly logger = createLogger('CommerceConversationService');
  private hookId?: string;
  private readonly voiceReplyChats = new Map<string, number>();

  constructor(
    private readonly hooks: HookManager,
    private readonly shopify: ShopifyService,
    private readonly woocommerce: WooCommerceService,
    private readonly youcan: YouCanService,
    private readonly messages: MessageService,
    private readonly encryption: CredentialEncryptionService,
    private readonly ai: CommerceAiAgentService,
    private readonly tools: CommerceToolService,
    private readonly audio: AudioTranscriptionService,
    private readonly planUsage: PlanUsageService,
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
    if (!sessionId || message.fromMe) return;
    const chatId = message.chatId ?? message.from;
    const isAudio = message.type === 'voice' || message.type === 'audio';
    let reply = message.body?.trim();
    if (isAudio) {
      const audioStore = await this.stores.findOneBy({ sessionId });
      if (!audioStore?.settings || ![Platform.SHOPIFY, Platform.WOOCOMMERCE, Platform.YOUCAN].includes(audioStore.provider)) return;
      if (!chatId || !message.media?.data || message.media.omitted) {
        this.logger.warn(`Incoming voice note has no downloadable media sessionId=${sessionId}`);
        return;
      }
      if (!await this.planUsage.reserveAudioTranscription(sessionId)) {
        await this.messages.sendText(sessionId, { chatId, text: "La transcription des messages vocaux n’est pas incluse dans votre forfait ou votre quota est épuisé. Passez à un forfait supérieur pour l’activer." });
        return;
      }
      try {
        const result = await this.audio.transcribe({
          buffer: Buffer.from(message.media.data, 'base64'),
          mimetype: message.media.mimetype || 'audio/ogg',
          originalname: message.media.filename || 'whatsapp-voice.ogg',
        }, audioStore.language);
        reply = result.text;
      } catch (error) {
        await this.planUsage.releaseAudioTranscription(sessionId);
        this.logger.error(`WhatsApp voice transcription failed sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        await this.messages.sendText(sessionId, { chatId, text: "Je n’ai pas pu comprendre ce message vocal. Réessayez ou envoyez-moi un message texte." });
        return;
      }
      this.voiceReplyChats.set(chatId, (this.voiceReplyChats.get(chatId) ?? 0) + 1);
    }
    if (!reply) return;

    try {
      await this.handleTranscribedReply(sessionId, message, reply);
    } finally {
      if (isAudio && chatId) {
        const remaining = (this.voiceReplyChats.get(chatId) ?? 1) - 1;
        if (remaining > 0) this.voiceReplyChats.set(chatId, remaining);
        else this.voiceReplyChats.delete(chatId);
      }
    }
  }

  private async handleTranscribedReply(sessionId: string, message: IncomingReply, reply: string): Promise<void> {

    const store = await this.stores.findOneBy({ sessionId });
    if (!store?.settings || ![Platform.SHOPIFY, Platform.WOOCOMMERCE, Platform.YOUCAN].includes(store.provider)) return;

    const sender = this.normalizePhone(message.senderPhone ?? message.from ?? message.chatId);
    if (!sender) return;
    const catalog = await this.storeProducts(store.id);
    const recentOrders = await this.orders.find({
      where: { storeId: store.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const customerOrders = recentOrders.filter(candidate => this.samePhone(sender, this.normalizePhone(candidate.phone)));
    const preparedEdit = customerOrders.length
      ? await this.conversations.findOne({
          where: { orderId: In(customerOrders.map(order => order.id)), pendingAction: 'confirm_shipping_address' },
          order: { updatedAt: 'DESC' },
        })
      : null;
    if (preparedEdit && /^(?:confirmer|confirm|oui\s+je\s+confirme|yes\s+i\s+confirm|wakha|نعم|تأكيد|annuler|cancel|stop|non|لا|إلغاء)$/i.test(reply.trim())) {
      const preparedOrder = customerOrders.find(order => order.id === preparedEdit.orderId);
      const chatId = message.chatId ?? message.from;
      if (preparedOrder && chatId) {
        const turns = [...(preparedEdit.turns ?? []), { role: 'customer' as const, text: reply.slice(0, 1000), at: new Date().toISOString() }];
        if (await this.handlePendingOrderEdit(sessionId, chatId, store, preparedOrder, preparedEdit, reply, turns)) return;
      }
    }
    // Looking up an existing order is never a request to create a new one. Previously the bare word
    // "order" started a cart before this distinction was made, trapping all later messages in the
    // numbered product menu.
    const productSelectionIntent = this.hasProductSelectionIntent(reply, catalog);
    if (
      !this.isGeneralOrderQuery(reply)
      && await this.handleNewOrder(
        sessionId,
        store,
        message,
        reply,
        sender,
        catalog,
        customerOrders,
        productSelectionIntent,
      )
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
        await this.sendReply(sessionId, { chatId, text: `Vous avez plusieurs commandes en attente. Indiquez le numéro de la commande concernée :\n${choices}` });
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
        await this.sendReply(sessionId, {
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
    if (await this.handlePendingOrderEdit(sessionId, chatId, store, order, conversation, customerText, turns)) return;
    if (this.hasAddressChangeIntent(customerText)) {
      conversation.pendingAction = 'collect_shipping_address';
      conversation.pendingData = null;
      conversation.turns = [...turns, { role: 'assistant', text: 'Envoyez la nouvelle livraison sous cette forme : Nom complet | Adresse | Ville | Code postal (optionnel) | Pays', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.sendReply(sessionId, { chatId, text: 'Bien sûr. Envoyez la nouvelle livraison sous cette forme :\n*Nom complet | Adresse | Ville | Code postal (optionnel) | Pays*\n\nExemple : Amine Alaoui | 15 rue Hassan II | Rabat | 10000 | Morocco' });
      return;
    }
    const timeoutHours = this.ai.timeoutHours();
    if (conversation.createdAt && Date.now() - new Date(conversation.updatedAt).getTime() > timeoutHours * 60 * 60 * 1000) {
      conversation.status = 'expired';
      conversation.turns = [...turns, { role: 'assistant', text: 'Cette conversation a expiré. Un conseiller va reprendre votre demande.', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.sendReply(sessionId, { chatId, text: 'Cette conversation a expiré. Un conseiller va reprendre votre demande.' });
      return;
    }
    const maxTurns = this.ai.maxTurns();
    if (conversation.turnCount >= maxTurns) {
      conversation.status = 'escalated';
      conversation.turns = [...turns, { role: 'assistant', text: 'Un conseiller va reprendre cette conversation.', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.sendReply(sessionId, { chatId, text: 'Un conseiller va reprendre cette conversation.' });
      return;
    }
    try {
      const catalog = this.relevantProducts(await this.storeProducts(store.id), customerText, order);
      const decision = await this.ai.respond(order, store.language, turns.slice(-8), { name: store.name, products: catalog }, sessionId);
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
      const safeDecisionReply = decision.action === 'continue' && this.hasUnverifiedMutationClaim(decision.reply)
        ? this.orderFallbackReply(customerText, order, store.language)
        : decision.reply;
      const text = decision.action === 'confirm'
        ? await this.confirmationMessage(store, order, decision.reply)
        : safeDecisionReply;
      await this.sendReply(sessionId, { chatId, text });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'AI conversation failed';
      const providerMutationFailed = order.confirmationStatus === 'processing_reply';
      conversation.lastError = reason;
      conversation.turns = turns;
      await this.conversations.save(conversation);
      if (providerMutationFailed) {
        order.confirmationStatus = 'pending'; order.confirmationError = reason; await this.orders.save(order);
      }
      this.logger.error(`AI order reply failed (order=${order.id}): ${reason}`);
      await this.sendReply(sessionId, {
        chatId,
        text: providerMutationFailed
          ? `Je n’ai pas pu mettre à jour la commande ${order.orderNumber ?? order.shopifyOrderId} pour le moment. Elle reste en attente; vous pouvez réessayer dans un instant.`
          : this.orderFallbackReply(customerText, order, store.language),
      });
    }
  }

  private async updateProviderOrder(store: Store, settings: Record<string, any>, order: Order, action: 'confirm' | 'cancel'): Promise<void> {
    if (store.provider === Platform.YOUCAN) {
      const credentials = settings as YouCanCredentials;
      if (!credentials.accessToken) throw new Error('YouCan connection is not configured.');
      if (action === 'confirm') await this.youcan.confirmOrder(credentials, order.shopifyOrderId);
      else await this.youcan.cancelOrder(credentials, order.shopifyOrderId);
      return;
    }
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
    let products: Product[] = [];
    try {
      const catalog = await this.storeProducts(store.id);
      products = this.tools.searchProducts(text, catalog, store.currency, 8).products;
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
      const customerPhone = this.normalizePhone(message.senderPhone ?? message.from ?? message.chatId);
      const answer = await this.ai.chatWithTools(
        turns,
        { name: store.name, language: store.language, products, orders: customerOrders },
        this.tools.definitions(),
        call => this.executeCommerceTool(call.name, call.arguments, store, customerPhone, catalog, customerOrders, text),
        sessionId,
      );
      const safeAnswer = this.hasUnverifiedMutationClaim(answer)
        ? this.catalogFallbackReply(text, products, customerOrders, store)
        : answer;
      await this.sendReply(sessionId, { chatId, text: safeAnswer.slice(0, 1500) });
    } catch (error) {
      this.logger.error(`AI catalog reply failed (store=${store.id}): ${error instanceof Error ? error.message : 'unknown error'}`);
      const fallback = this.catalogFallbackReply(text, products, customerOrders, store);
      await this.sendReply(sessionId, { chatId, text: fallback });
    }
  }

  private async sendReply(sessionId: string, dto: { chatId: string; text: string }) {
    if (!this.voiceReplyChats.has(dto.chatId)) return this.messages.sendText(sessionId, dto);
    if (!await this.planUsage.reserveAudioReply(sessionId)) return this.messages.sendText(sessionId, dto);
    try {
      const speech = await this.audio.synthesize(dto.text);
      const voiceNoteCompatible = /(?:audio\/(?:ogg|opus)|opus)/i.test(speech.contentType);
      const extension = /wav/i.test(speech.contentType) ? 'wav' : voiceNoteCompatible ? 'ogg' : 'mp3';
      return await this.messages.sendAudio(sessionId, {
        chatId: dto.chatId,
        base64: speech.data.toString('base64'),
        mimetype: speech.contentType,
        filename: `assistant-reply.${extension}`,
        // WhatsApp PTT requires Ogg/Opus. Deepgram currently returns MP3/WAV through OmniRoute;
        // sending those bytes as PTT creates an unreadable voice bubble. Keep them as playable audio.
        ptt: voiceNoteCompatible,
      });
    } catch (error) {
      await this.planUsage.releaseAudioReply(sessionId);
      this.logger.error(`WhatsApp voice generation failed sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      return this.messages.sendText(sessionId, dto);
    }
  }

  private async executeCommerceTool(
    name: string,
    input: Record<string, unknown>,
    store: Store,
    phone: string,
    catalog: Product[],
    customerOrders: Order[],
    customerText: string,
  ): Promise<Record<string, unknown>> {
    if (!phone) return { error: 'CUSTOMER_PHONE_UNAVAILABLE' };
    if (name === 'search_products') {
      const query = typeof input.query === 'string' ? input.query.slice(0, 200) : '';
      const limit = Math.min(8, Math.max(1, Number(input.limit) || 5));
      return this.tools.searchProducts(query, catalog, store.currency, limit).call.result;
    }
    if (name === 'get_product_details') {
      const product = catalog.find(item => item.id === String(input.product_id ?? ''));
      if (!product) return { error: 'PRODUCT_NOT_FOUND' };
      return {
        id: product.id,
        name: product.title,
        description: product.description,
        price: Number(product.price),
        currency: store.currency,
        stock: this.tools.stock(product),
        variants: (product.variants ?? []).slice(0, 20).map(variant => ({
          id: String(variant.admin_graphql_api_id ?? variant.id ?? ''),
          name: String(variant.title ?? variant.name ?? 'Default Title'),
          price: Number(variant.price ?? product.price),
          stock: Number.isFinite(Number(variant.inventory_quantity ?? variant.inventoryQuantity))
            ? Number(variant.inventory_quantity ?? variant.inventoryQuantity)
            : null,
        })),
      };
    }
    if (name === 'list_customer_orders') {
      return {
        count: customerOrders.length,
        orders: customerOrders.slice(0, 10).map(order => ({
          order_number: order.orderNumber ?? order.shopifyOrderId,
          status: order.status,
          confirmation_status: order.confirmationStatus,
          total: Number(order.totalPrice),
          currency: order.currency,
          items: (order.lineItems ?? []).map(item => ({ name: item.title ?? item.name, quantity: item.quantity ?? 1 })),
        })),
      };
    }
    if (name === 'get_order_details') {
      const requested = String(input.order_number ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const order = customerOrders.find(item =>
        String(item.orderNumber ?? item.shopifyOrderId).replace(/[^a-z0-9]/gi, '').toLowerCase() === requested,
      );
      if (!order) return { error: 'ORDER_NOT_FOUND' };
      return {
        order_number: order.orderNumber ?? order.shopifyOrderId,
        status: order.status,
        confirmation_status: order.confirmationStatus,
        total: Number(order.totalPrice),
        currency: order.currency,
        items: order.lineItems ?? [],
        shipping_address: order.shippingAddress ?? null,
      };
    }
    if (name === 'get_active_cart') {
      const cart = await this.carts.findOneBy({ storeId: store.id, phone });
      if (!cart) return { active: false };
      const product = catalog.find(item => item.id === cart.productId);
      return {
        active: true,
        product: product ? { id: product.id, name: product.title, price: Number(product.price), currency: store.currency } : null,
        variant_id: cart.variantId,
        variant_name: cart.variantTitle,
        quantity: cart.quantity,
        next_required: cart.step,
      };
    }
    if (name === 'get_store_information') {
      return {
        id: store.id,
        name: store.name,
        provider: store.provider,
        owner_name: store.ownerName ?? null,
        email: store.email,
        phone: store.phone ?? null,
        language: store.language,
        timezone: store.timezone,
        currency: store.currency,
        status: store.status,
      };
    }
    if (name === 'prepare_shipping_address_update') {
      const order = this.findCustomerOrder(customerOrders, input.order_number);
      if (!order) return { error: 'ORDER_NOT_FOUND', prepared: false };
      const customerName = this.toolString(input.customer_name, 150);
      const address1 = this.toolString(input.address1, 300);
      const city = this.toolString(input.city, 100);
      const postalCode = this.toolString(input.postal_code, 30, true);
      const country = this.toolString(input.country, 100, true) || String(order.shippingAddress?.country ?? 'Morocco');
      if (!customerName || !address1 || !city) return { error: 'MISSING_SHIPPING_FIELDS', prepared: false };
      let conversation = await this.conversations.findOneBy({ orderId: order.id });
      conversation ??= this.conversations.create({
        orderId: order.id, storeId: store.id, status: 'active', turnCount: 0, turns: [],
      });
      conversation.pendingAction = 'confirm_shipping_address';
      conversation.pendingData = { customerName, address1, city, postalCode: postalCode || undefined, country, phone: order.phone ?? undefined };
      await this.conversations.save(conversation);
      this.logToolCall('prepare_shipping_address_update', store.id, phone, { orderNumber: order.orderNumber ?? order.shopifyOrderId });
      return {
        prepared: true,
        applied: false,
        order_number: order.orderNumber ?? order.shopifyOrderId,
        preview: { customer_name: customerName, address1, city, postal_code: postalCode || null, country },
        next_required: 'explicit_confirmation',
        required_reply: 'CONFIRMER',
        instruction: 'The provider has not been updated. Ask the customer to reply CONFIRMER or ANNULER.',
      };
    }
    if (name === 'apply_shipping_address_update') {
      const order = this.findCustomerOrder(customerOrders, input.order_number);
      if (!order) return { error: 'ORDER_NOT_FOUND', updated: false };
      if (!/^(?:confirmer|confirm|oui\s+je\s+confirme|yes\s+i\s+confirm|wakha|نعم|تأكيد)$/i.test(customerText.trim())) {
        return { error: 'EXPLICIT_CONFIRMATION_REQUIRED', updated: false, required_reply: 'CONFIRMER' };
      }
      const conversation = await this.conversations.findOneBy({ orderId: order.id });
      if (conversation?.pendingAction !== 'confirm_shipping_address' || !conversation.pendingData) {
        return { error: 'NO_PREPARED_SHIPPING_UPDATE', updated: false };
      }
      await this.applyPreparedShippingUpdate(store, order, conversation.pendingData);
      conversation.pendingAction = null;
      conversation.pendingData = null;
      await this.conversations.save(conversation);
      this.logToolCall('apply_shipping_address_update', store.id, phone, { orderNumber: order.orderNumber ?? order.shopifyOrderId });
      return {
        updated: true,
        provider: store.provider,
        order_number: order.orderNumber ?? order.shopifyOrderId,
        shipping_address: order.shippingAddress,
      };
    }
    if (name === 'start_new_order') {
      const product = catalog.find(item => item.id === String(input.product_id ?? ''));
      if (!product) return { error: 'PRODUCT_NOT_FOUND', created: false };
      const requestedQuantity = input.quantity === undefined ? null : Number(input.quantity);
      if (requestedQuantity !== null && (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 99)) {
        return { error: 'INVALID_QUANTITY', created: false };
      }
      const variants = product.variants ?? [];
      const requestedVariant = input.variant_id === undefined ? null : String(input.variant_id);
      const variant = requestedVariant
        ? variants.find(item => String(item.admin_graphql_api_id ?? item.id ?? '') === requestedVariant)
        : variants.length === 1 ? variants[0] : undefined;
      if (requestedVariant && !variant) return { error: 'VARIANT_NOT_FOUND', created: false };
      let cart = await this.carts.findOneBy({ storeId: store.id, phone });
      cart ??= this.carts.create({ storeId: store.id, phone, step: 'product', quantity: 1, country: 'Morocco' });
      cart.productId = product.id;
      cart.variantId = variant
        ? [Platform.WOOCOMMERCE, Platform.YOUCAN].includes(store.provider)
          ? String(variant.id ?? '')
          : String(variant.admin_graphql_api_id ?? (variant.id ? `gid://shopify/ProductVariant/${variant.id}` : ''))
        : null;
      cart.variantTitle = variant ? String(variant.title ?? variant.name ?? 'Default Title') : null;
      if (requestedQuantity !== null) cart.quantity = requestedQuantity;
      cart.step = variants.length > 1 && !variant ? 'variant' : requestedQuantity === null ? 'quantity' : 'name';
      cart = await this.carts.save(cart);
      this.logToolCall('start_new_order', store.id, phone, { productId: product.id, quantity: requestedQuantity });
      return {
        cart_started: true,
        created: false,
        product: { id: product.id, name: product.title, price: Number(variant?.price ?? product.price), currency: store.currency },
        quantity: requestedQuantity,
        next_required: cart.step,
        variants: cart.step === 'variant'
          ? variants.slice(0, 10).map(item => ({
              id: String(item.admin_graphql_api_id ?? item.id ?? ''),
              name: String(item.title ?? item.name ?? 'Default Title'),
              price: Number(item.price ?? product.price),
            }))
          : undefined,
        instruction: 'No Shopify/WooCommerce order exists yet. Ask only for next_required.',
      };
    }
    return { error: 'UNKNOWN_TOOL', tool: name };
  }

  private findCustomerOrder(orders: Order[], value: unknown): Order | undefined {
    const requested = String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!requested) return undefined;
    return orders.find(order =>
      String(order.orderNumber ?? order.shopifyOrderId).replace(/[^a-z0-9]/gi, '').toLowerCase() === requested,
    );
  }

  private toolString(value: unknown, max: number, optional = false): string {
    if (value === undefined || value === null) return optional ? '' : '';
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  private async applyPreparedShippingUpdate(
    store: Store,
    order: Order,
    data: { customerName: string; address1: string; city: string; postalCode?: string; country: string; phone?: string },
  ): Promise<void> {
    const settings = this.encryption.revealSettings(store.settings ?? {});
    if (store.provider === Platform.YOUCAN) {
      await this.youcan.updateOrderShippingAddress(settings as unknown as YouCanCredentials, order.shopifyOrderId, {
        name: data.customerName, address: data.address1, city: data.city, zip_code: data.postalCode ?? '', country: data.country, phone: data.phone,
      });
    } else if (store.provider === Platform.WOOCOMMERCE) {
      await this.woocommerce.updateOrderShippingAddress({
        siteUrl: String(settings.siteUrl ?? ''),
        consumerKey: String(settings.consumerKey ?? ''),
        consumerSecret: String(settings.consumerSecret ?? ''),
      }, order.shopifyOrderId, {
        first_name: data.customerName.split(/\s+/)[0],
        last_name: data.customerName.split(/\s+/).slice(1).join(' '),
        address_1: data.address1,
        city: data.city,
        postcode: data.postalCode ?? '',
        country: data.country,
      });
    } else {
      await this.shopify.updateOrderShippingAddress(
        String(settings.shopDomain ?? ''),
        String(settings.accessToken ?? ''),
        order.shopifyOrderId,
        { name: data.customerName, address1: data.address1, city: data.city, zip: data.postalCode, country: data.country, phone: data.phone },
      );
    }
    order.customerName = data.customerName;
    order.shippingAddress = {
      ...(order.shippingAddress ?? {}),
      name: data.customerName,
      address1: data.address1,
      city: data.city,
      zip: data.postalCode,
      country: data.country,
    };
    await this.orders.save(order);
  }

  /**
   * Keep WhatsApp useful during a provider outage/rate-limit. A technical AI failure is not a
   * human handoff: answer factual order questions locally and leave the order actionable.
   */
  private orderFallbackReply(text: string, order: Order, language?: string): string {
    const normalized = text.toLowerCase();
    const reference = order.orderNumber ?? order.shopifyOrderId;
    const darija = /\b(?:salam|ch7al|chnou|chno|fin|bghit|wach|dyali|3ndi)\b|[\u0600-\u06ff]/i.test(text);
    const items = (order.lineItems ?? [])
      .map(item => `${item.quantity ?? 1}× ${item.title ?? item.name ?? 'produit'}`)
      .join(', ');
    if (/total|price|prix|montant|ch7al|ثمن|المجموع/i.test(normalized)) {
      return darija
        ? `Total dyal commande ${reference} هو ${order.totalPrice} ${order.currency}.`
        : `Le total de la commande ${reference} est de ${order.totalPrice} ${order.currency}.`;
    }
    if (/status|statut|état|etat|fin وصل|فين وصل|confirmation/i.test(normalized)) {
      return darija
        ? `Commande ${reference}: statut ${order.status}, confirmation ${order.confirmationStatus}.`
        : `Commande ${reference} : statut ${order.status}, confirmation WhatsApp ${order.confirmationStatus}.`;
    }
    if (/produit|article|item|شنو|اش خديت|commande فيها/i.test(normalized) && items) {
      return darija ? `Commande ${reference} فيها: ${items}.` : `La commande ${reference} contient : ${items}.`;
    }
    if (/adresse|address|livraison|عنوان/i.test(normalized)) {
      const address = order.shippingAddress ?? {};
      const rendered = [address.name, address.address1, address.city, address.zip, address.country].filter(Boolean).join(', ');
      return rendered
        ? `Adresse de livraison de la commande ${reference} : ${rendered}.`
        : `L’adresse de livraison de la commande ${reference} n’est pas disponible.`;
    }
    if (/^(?:salam|bonjour|bonsoir|hello|hi|السلام|سلام)[\s!.?]*$/i.test(text.trim())) {
      return darija
        ? `وعليكم السلام 😊 كيفاش نقدر نعاونك فالطلب ${reference}؟`
        : `Bonjour 😊 Comment puis-je vous aider avec la commande ${reference} ?`;
    }
    return darija
      ? `نقدر نعاونك فالطلب ${reference}: المجموع ${order.totalPrice} ${order.currency}. واش بغيتي تأكدها، تلغيها، ولا تسول على شي معلومة؟`
      : `Je peux vous aider avec la commande ${reference} (${order.totalPrice} ${order.currency}). Souhaitez-vous la confirmer, l’annuler ou vérifier une information ?`;
  }

  private catalogFallbackReply(text: string, products: Product[], orders: Order[], store: Store): string {
    const normalized = text.toLowerCase();
    const darija = /\b(?:salam|ch7al|chnou|chno|fin|bghit|wach|dyali|3ndi)\b|[\u0600-\u06ff]/i.test(text);
    if (this.isGeneralOrderQuery(text)) {
      if (!orders.length) return darija ? 'ما لقيت حتى طلب مربوط بهاد الرقم.' : 'Je n’ai trouvé aucune commande liée à votre numéro.';
      const lines = orders.slice(0, 5).map(order => `• ${order.orderNumber ?? order.shopifyOrderId} — ${order.totalPrice} ${order.currency} — ${order.status}`).join('\n');
      return `${darija ? 'هادو هما الطلبات ديالك:' : 'Voici vos commandes :'}\n${lines}`;
    }
    const matches = this.tools.searchProducts(text, products, store.currency, 5).products;
    if (/produit|catalog|article|شنو|اش عندكم|3ndkom/i.test(normalized) || matches.length) {
      const choices = (matches.length ? matches : products).slice(0, 5)
        .map((product, index) => `${index + 1}. ${product.title} — ${product.price} ${store.currency}`)
        .join('\n');
      if (choices) return `${darija ? 'ها بعض المنتجات المتوفرة:' : 'Voici quelques produits disponibles :'}\n${choices}`;
    }
    return darija ? 'مرحبا 😊 قول ليا شنو بغيتي تعرف على المنتجات ولا الطلبات ديالك؟' : 'Bonjour 😊 Que souhaitez-vous savoir sur nos produits ou vos commandes ?';
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
    forceStart = false,
  ): Promise<boolean> {
    const chatId = message.chatId ?? message.from;
    if (!chatId) return false;
    let cart = await this.carts.findOneBy({ storeId: store.id, phone });
    if (!cart && !forceStart && !this.hasPurchaseIntent(text)) return false;
    if (!cart) {
      cart = this.carts.create({ storeId: store.id, phone, step: 'product', quantity: 1, country: 'Morocco' });
      this.logToolCall('start_new_order', store.id, phone, { sourceText: text.slice(0, 120) });
    }
    const cancel = /\b(cancel|annul|stop|ncancel|ma bghit|la ma bghitch)\w*\b|إلغاء|الغاء|لا أريد/i.test(text);
    if (cancel) {
      if (cart.id) await this.carts.delete(cart.id);
      await this.sendReply(sessionId, { chatId, text: 'D’accord, la nouvelle commande a été annulée.' });
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
        await this.sendReply(sessionId, { chatId, text: `Quel produit souhaitez-vous commander ? Répondez avec le numéro :\n${choices}` });
        return true;
      }
      cart.productId = product.id;
      this.logToolCall('select_product', store.id, phone, { productId: product.id, productName: product.title });
      const variants = product.variants ?? [];
      if (variants.length > 1) {
        cart.step = 'variant'; await this.carts.save(cart);
        await this.sendReply(sessionId, { chatId, text: `Choisissez une option pour ${product.title}. Répondez avec le numéro :\n${variants.slice(0, 10).map((item, index) => `${index + 1}. ${item.title} — ${item.price ?? product.price} ${store.currency}`).join('\n')}` });
      } else {
        const variant = variants[0];
        cart.variantId = [Platform.WOOCOMMERCE, Platform.YOUCAN].includes(store.provider)
          ? String(variant?.id ?? '')
          : String(variant?.admin_graphql_api_id ?? (variant?.id ? `gid://shopify/ProductVariant/${variant.id}` : ''));
        cart.variantTitle = String(variant?.title ?? 'Default Title'); cart.step = 'quantity'; await this.carts.save(cart);
        await this.sendReply(sessionId, { chatId, text: `Combien d’unités de ${product.title} souhaitez-vous ?` });
      }
      return true;
    }
    const product = products.find(item => item.id === cart.productId);
    if (!product) { await this.carts.delete(cart.id); return false; }
    if (cart.step === 'variant') {
      const variants = product.variants ?? [];
      const selectedNumber = this.choiceNumber(text, variants.length);
      const variant = selectedNumber ? variants[selectedNumber - 1] : variants.find(item => text.toLowerCase().includes(String(item.title ?? '').toLowerCase()));
      if (!variant) { await this.sendReply(sessionId, { chatId, text: `Je n’ai pas reconnu l’option. Répondez avec un numéro :\n${variants.slice(0, 10).map((item, index) => `${index + 1}. ${item.title}`).join('\n')}` }); return true; }
      cart.variantId = [Platform.WOOCOMMERCE, Platform.YOUCAN].includes(store.provider)
        ? String(variant.id ?? '')
        : String(variant.admin_graphql_api_id ?? `gid://shopify/ProductVariant/${variant.id}`); cart.variantTitle = String(variant.title); cart.step = 'quantity'; await this.carts.save(cart);
      await this.sendReply(sessionId, { chatId, text: 'Quelle quantité souhaitez-vous ?' }); return true;
    }
    if (cart.step === 'quantity') {
      const affirmative = /^(?:yes|oui|نعم|اه|آه|wakha|واخا)$/i.test(text.trim());
      const quantity = affirmative ? 1 : Number(text.match(/\d+/)?.[0]);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) { await this.sendReply(sessionId, { chatId, text: 'Indiquez une quantité entre 1 et 99.' }); return true; }
      cart.quantity = quantity; cart.step = 'name'; await this.carts.save(cart);
      await this.sendReply(sessionId, { chatId, text: 'Quel est votre nom complet pour la livraison ?' }); return true;
    }
    if (cart.step === 'name') { cart.customerName = text.slice(0, 150); cart.step = 'address'; await this.carts.save(cart); await this.sendReply(sessionId, { chatId, text: 'Quelle est votre adresse de livraison (rue, numéro et quartier) ?' }); return true; }
    if (cart.step === 'address') { cart.address1 = text.slice(0, 300); cart.step = 'city'; await this.carts.save(cart); await this.sendReply(sessionId, { chatId, text: 'Dans quelle ville ?' }); return true; }
    if (cart.step === 'city') {
      cart.city = text.slice(0, 100); cart.step = 'confirm'; await this.carts.save(cart);
      const variant = (product.variants ?? []).find(item => String(item.admin_graphql_api_id ?? `gid://shopify/ProductVariant/${item.id}`) === cart.variantId);
      const unitPrice = Number(variant?.price ?? product.price);
      const summary = `Résumé de votre nouvelle commande :\n• ${product.title}${cart.variantTitle && cart.variantTitle !== 'Default Title' ? ` — ${cart.variantTitle}` : ''}\n• Quantité : ${cart.quantity}\n• Total produits : ${(unitPrice * cart.quantity).toFixed(2)} ${store.currency}\n• Livraison : ${cart.customerName}, ${cart.address1}, ${cart.city}\n• Téléphone : +${phone}`;
      await this.sendReply(sessionId, {
        chatId,
        text: `${summary}\n\n✅ Répondez *CONFIRMER* pour créer la commande.\n❌ Répondez *ANNULER* pour arrêter.`,
      });
      return true;
    }
    if (cart.step === 'confirm') {
      if (!/\b(confirm|confirmer|confirme|nconfirm|yes|oui|wakha)\w*\b|تأكيد|أؤكد|اؤكد|نعم/i.test(text)) { await this.sendReply(sessionId, { chatId, text: 'Répondez CONFIRMER pour créer la commande, ou ANNULER pour arrêter.' }); return true; }
      const settings = this.encryption.revealSettings(store.settings ?? {});
      try {
        const result = store.provider === Platform.WOOCOMMERCE
          ? await this.woocommerce.createConfirmedChatOrder({
              siteUrl: String(settings.siteUrl ?? ''), consumerKey: String(settings.consumerKey ?? ''),
              consumerSecret: String(settings.consumerSecret ?? ''), webhookSecret: String(settings.webhookSecret ?? ''),
              webhookBaseUrl: String(settings.webhookBaseUrl ?? ''),
            }, {
              productId: product.shopifyProductId, variationId: cart.variantId, quantity: cart.quantity,
              phone: `+${phone}`, customerName: String(cart.customerName), address1: String(cart.address1),
              city: String(cart.city), postalCode: cart.postalCode, country: cart.country,
            })
          : store.provider === Platform.YOUCAN
            ? await this.youcan.createConfirmedChatOrder(settings as unknown as YouCanCredentials, {
                variantId: String(cart.variantId), price: Number(product.price), quantity: cart.quantity,
                phone: `+${phone}`, customerName: String(cart.customerName), address1: String(cart.address1),
                city: String(cart.city), postalCode: cart.postalCode, country: cart.country,
                shippingEstimationId: String(settings.youcanShippingEstimationId ?? ''),
              })
            : await this.shopify.createConfirmedChatOrder(String(settings.shopDomain ?? ''), String(settings.accessToken ?? ''), {
              variantId: String(cart.variantId), quantity: cart.quantity, phone: `+${phone}`,
              customerName: String(cart.customerName), address1: String(cart.address1), city: String(cart.city),
              postalCode: cart.postalCode, country: cart.country,
            });
        await this.carts.delete(cart.id);
        this.logToolCall('create_order', store.id, phone, {
          productId: product.id,
          quantity: cart.quantity,
          provider: store.provider,
          orderNumber: result.orderName ?? null,
        });
        await this.sendReply(sessionId, { chatId, text: `Votre commande ${result.orderName ?? ''} a été créée et confirmée avec succès ✅` });
      } catch (error) {
        this.logger.error(`Chat order creation failed (store=${store.id}, customer=${phone.slice(-4)}): ${error instanceof Error ? error.message : 'unknown error'}`);
        await this.sendReply(sessionId, { chatId, text: `Je n’ai pas pu créer la commande dans ${store.provider} pour le moment. Vos informations sont conservées; répondez CONFIRMER pour réessayer ou ANNULER.` });
      }
      return true;
    }
    return false;
  }

  private hasPurchaseIntent(text: string): boolean {
    // Require a clear creation/buying verb. A bare "order/commande/طلب" is commonly an existing
    // order enquiry and must remain conversational.
    return /\b(?:buy|purchase|commander|acheter|achete|nchri|nakhod|nakhdo|nakhdoh|ncommandi)\b|\b(?:i want|i need|want to|would like to)\s+(?:buy|purchase|order|create|place)\b|\b(?:create|place|make|start|continue|complete)\s+(?:a\s+|an\s+|new\s+)?(?:order|purchase)\b|\b(?:je veux|je voudrais|j aimerais|on peut|peux tu|pouvez vous)\s+(?:commander|acheter|créer|creer|faire|passer|démarrer|demarrer|continuer)\b|\b(?:créer|creer|faire|passer|démarrer|demarrer|continuer|finaliser)\s+(?:une?\s+)?(?:commande|order)\b|\bbghit\s+(?:nchri|nakhod|nakhdo|nakhdoh|ncommandi|ndir|ndor|ndiro|ncreer|nkml|nkemel)\b|\b(?:ndir|ndor|ndiro|ncreer|cree|créer|nkml|nkemel|tkmel)\s+(?:order|commande|talab|talabiya)\b|\b(?:commande|order|talab|talabiya)\s+(?:jdida|jdid|nouvelle|new)\b|(?:بغيت|أريد)\s+(?:نشتري|نطلب|شراء|ناخد|ناخدو|ناخذه|ندير)|(?:ندير|نكمل|دير|دوز|أنشئ|انشئ)\s+(?:طلب|الطلب|طلبية)/i.test(text);
  }

  private hasAddressChangeIntent(text: string): boolean {
    return /(?:change|modifier|corriger|update).{0,25}(?:adresse|address|livraison)|(?:adresse|address).{0,25}(?:change|modifier|corriger)|بدل.{0,15}العنوان|تغيير.{0,15}العنوان|bdel.{0,15}(?:adresse|address)/i.test(text);
  }

  private async handlePendingOrderEdit(
    sessionId: string,
    chatId: string,
    store: Store,
    order: Order,
    conversation: OrderAiConversation,
    text: string,
    turns: Array<{ role: 'customer' | 'assistant'; text: string; at: string }>,
  ): Promise<boolean> {
    if (!conversation.pendingAction) return false;
    const cancel = /^(?:annuler|cancel|stop|la|non|لا|إلغاء)$/i.test(text.trim());
    if (cancel) {
      conversation.pendingAction = null; conversation.pendingData = null;
      conversation.turns = [...turns, { role: 'assistant', text: 'La modification de livraison a été annulée.', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.sendReply(sessionId, { chatId, text: 'D’accord, la modification de livraison a été annulée.' });
      return true;
    }
    if (conversation.pendingAction === 'collect_shipping_address') {
      const parts = text.split('|').map(value => value.trim());
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        await this.sendReply(sessionId, { chatId, text: 'Je n’ai pas pu lire toutes les informations. Utilisez :\n*Nom complet | Adresse | Ville | Code postal (optionnel) | Pays*' });
        return true;
      }
      conversation.pendingData = {
        customerName: parts[0], address1: parts[1], city: parts[2],
        postalCode: parts[3] || undefined, country: parts[4] || String(order.shippingAddress?.country ?? 'Morocco'),
        phone: order.phone ?? undefined,
      };
      conversation.pendingAction = 'confirm_shipping_address';
      const preview = `Nouvelle livraison pour ${order.orderNumber ?? order.shopifyOrderId} :\n• ${parts[0]}\n• ${parts[1]}, ${parts[2]}${parts[3] ? `, ${parts[3]}` : ''}\n• ${parts[4] || order.shippingAddress?.country || 'Morocco'}\n\nRépondez *CONFIRMER* pour appliquer ou *ANNULER*.`;
      conversation.turns = [...turns, { role: 'assistant', text: preview, at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.sendReply(sessionId, { chatId, text: preview });
      return true;
    }
    if (conversation.pendingAction === 'confirm_shipping_address') {
      if (!/^(?:confirmer|confirm|oui|yes|wakha|نعم|تأكيد)$/i.test(text.trim())) {
        await this.sendReply(sessionId, { chatId, text: 'Répondez CONFIRMER pour appliquer la nouvelle adresse, ou ANNULER.' });
        return true;
      }
      const data = conversation.pendingData;
      if (!data) { conversation.pendingAction = null; await this.conversations.save(conversation); return false; }
      await this.applyPreparedShippingUpdate(store, order, data);
      this.logToolCall('apply_shipping_address_update', store.id, this.normalizePhone(order.phone), {
        orderNumber: order.orderNumber ?? order.shopifyOrderId,
      });
      conversation.pendingAction = null; conversation.pendingData = null;
      conversation.turns = [...turns, { role: 'assistant', text: 'L’adresse de livraison a été mise à jour avec succès ✅', at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.sendReply(sessionId, { chatId, text: `L’adresse de livraison de la commande ${order.orderNumber ?? order.shopifyOrderId} a été mise à jour avec succès ✅` });
      return true;
    }
    return false;
  }

  private hasReferentialPurchaseIntent(text: string): boolean {
    return /\b(?:nakhod|nakhdo|nakhdoh|take it|buy it|this one|nkml|nkemel|tkmel|continue|complete)\b|(?:ناخد|ناخدو|ناخذه|هذا|هادا|نكمل|كمل)/i.test(text);
  }

  private hasProductSelectionIntent(text: string, products: Product[]): boolean {
    if (!this.matchProduct(text, products)) return false;
    return /\b(?:je veux|je prends|je choisis|i want|i ll take|i will take|bghit|nakhod|nakhdo|khdit|choix|option)\b|(?:بغيت|ناخد|نختار|أريد)/i.test(text);
  }

  /** Never forward an AI-only mutation claim; only provider tool results may authorize one. */
  private hasUnverifiedMutationClaim(text: string): boolean {
    return /(?:commande|order|طلب(?:ية)?)\s*(?:#?\w+\s*)?(?:a été|est|was|has been|تمت|راه|tqaddat)?\s*(?:cré[ée]e?|cree|created|confirm[ée]e?|confirmed|enregistr[ée]e?|saved|تأكد|تسجل|تسجلات)|(?:cré[ée]e?|cree|created|confirm[ée]e?|confirmed|enregistr[ée]e?|saved)\s+(?:la\s+|votre\s+|your\s+)?(?:commande|order)|(?:tqaddat|tsajlat|tconfirmat)\b/i.test(text);
  }

  private logToolCall(tool: string, storeId: string, phone: string, input: Record<string, unknown>): void {
    this.logger.log('Commerce tool executed', {
      action: 'commerce_tool_executed',
      tool,
      storeId,
      customer: phone.slice(-4),
      input,
    });
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

