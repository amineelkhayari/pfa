import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { providerSupports } from '../../../commerce/integration-provider.interface';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { createLogger } from '../../../common/services/logger.service';
import { MessageService } from '../../message/message.service';
import { Product } from '../../stores/entities/product.entity';
import { StoreOrderCart } from '../../stores/entities/store-order-cart.entity';
import { Store } from '../../stores/entities/store.entity';
import { Platform } from '../../stores/enum/platform.enum';
import { CommerceVoiceService } from './commerce-voice.service';
import { CommerceExecutionLogService } from './commerce-execution-log.service';
import { CommerceToolExecution } from '../../stores/entities/commerce-tool-execution.entity';

export type CartConversationResult = 'not_handled' | 'handled' | 'catalog_assistance';

export interface CartConversationInput {
  sessionId: string;
  chatId: string;
  store: Store;
  text: string;
  phone: string;
  products: Product[];
  forceStart?: boolean;
  catalogAssistantEnabled?: boolean;
  messageId?: string;
}

@Injectable()
export class CommerceCartConversationService {
  private readonly logger = createLogger('CommerceCartConversationService');

  constructor(
    private readonly providers: IntegrationProviderRegistry,
    private readonly encryption: CredentialEncryptionService,
    private readonly messages: MessageService,
    private readonly voice: CommerceVoiceService,
    private readonly executions: CommerceExecutionLogService,
    @InjectRepository(StoreOrderCart, 'data') private readonly carts: Repository<StoreOrderCart>,
  ) {}

  hasProductSelectionIntent(text: string, products: Product[]): boolean {
    if (!this.matchProduct(text, products)) return false;
    return /\b(?:je veux|je prends|je choisis|i want|i ll take|i will take|bghit|nakhod|nakhdo|khdit|choix|option)\b|(?:بغيت|ناخد|نختار|أريد)/i.test(
      text,
    );
  }

  async getActiveCart(store: Store, phone: string, products: Product[]): Promise<Record<string, unknown>> {
    const cart = await this.carts.findOneBy({ storeId: store.id, phone });
    if (!cart) return { active: false };
    const product = products.find(item => item.id === cart.productId);
    return {
      active: true,
      product: product
        ? { id: product.id, name: product.title, price: Number(product.price), currency: store.currency }
        : null,
      variant_id: cart.variantId,
      variant_name: cart.variantTitle,
      quantity: cart.quantity,
      next_required: cart.step,
    };
  }

  async startFromTool(
    store: Store,
    phone: string,
    products: Product[],
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const requestedProductId = typeof input.product_id === 'string' ? input.product_id : '';
    const product = products.find(item => item.id === requestedProductId);
    if (!product) return { error: 'PRODUCT_NOT_FOUND', created: false };
    const requestedQuantity = input.quantity === undefined ? null : Number(input.quantity);
    if (
      requestedQuantity !== null &&
      (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 99)
    ) {
      return { error: 'INVALID_QUANTITY', created: false };
    }
    const variants = product.variants ?? [];
    const requestedVariant = typeof input.variant_id === 'string' ? input.variant_id : null;
    const variant = requestedVariant
      ? variants.find(item => this.providerVariantId(store.provider, item) === requestedVariant)
      : variants.length === 1
        ? variants[0]
        : undefined;
    if (requestedVariant && !variant) return { error: 'VARIANT_NOT_FOUND', created: false };
    let cart = await this.carts.findOneBy({ storeId: store.id, phone });
    cart ??= this.carts.create({ storeId: store.id, phone, step: 'product', quantity: 1, country: 'Morocco' });
    cart.productId = product.id;
    cart.variantId = variant ? this.providerVariantId(store.provider, variant) : null;
    cart.variantTitle = variant ? String(variant.title ?? variant.name ?? 'Default Title') : null;
    if (requestedQuantity !== null) cart.quantity = requestedQuantity;
    cart.step = variants.length > 1 && !variant ? 'variant' : requestedQuantity === null ? 'quantity' : 'name';
    cart = await this.carts.save(cart);
    this.logToolCall('start_new_order', store.id, phone, { productId: product.id, quantity: requestedQuantity });
    return {
      cart_started: true,
      created: false,
      product: {
        id: product.id,
        name: product.title,
        price: Number(variant?.price ?? product.price),
        currency: store.currency,
      },
      quantity: requestedQuantity,
      next_required: cart.step,
      variants:
        cart.step === 'variant'
          ? variants.slice(0, 10).map(item => ({
              id: this.providerVariantId(store.provider, item),
              name: String(item.title ?? item.name ?? 'Default Title'),
              price: Number(item.price ?? product.price),
            }))
          : undefined,
      instruction: 'No provider order exists yet. Ask only for next_required.',
    };
  }

  async handle(input: CartConversationInput): Promise<CartConversationResult> {
    const { sessionId, chatId, store, text, phone, products } = input;
    let cart = await this.carts.findOneBy({ storeId: store.id, phone });
    if (!cart && !input.forceStart && !this.hasPurchaseIntent(text)) return 'not_handled';
    if (!cart) {
      cart = this.carts.create({ storeId: store.id, phone, step: 'product', quantity: 1, country: 'Morocco' });
      this.logToolCall('start_new_order', store.id, phone, { sourceText: text.slice(0, 120) });
    }

    if (/\b(cancel|annul|stop|ncancel|ma bghit|la ma bghitch)\w*\b|إلغاء|الغاء|لا أريد/i.test(text)) {
      if (cart.id) await this.carts.delete(cart.id);
      await this.reply(sessionId, chatId, 'D’accord, la nouvelle commande a été annulée.');
      return 'handled';
    }

    if (cart.step === 'product') {
      const selectedNumber = this.choiceNumber(text, products.length);
      let product = selectedNumber ? products[selectedNumber - 1] : this.matchProduct(text, products);
      if (!product && this.hasReferentialPurchaseIntent(text)) {
        product = await this.recentlyMentionedProduct(sessionId, chatId, products);
      }
      if (!product) {
        await this.carts.save(cart);
        if (input.catalogAssistantEnabled) return 'catalog_assistance';
        const choices = products
          .slice(0, 10)
          .map((item, index) => `${index + 1}. ${item.title} — ${item.price} ${store.currency}`)
          .join('\n');
        await this.reply(
          sessionId,
          chatId,
          `Quel produit souhaitez-vous commander ? Répondez avec le numéro :\n${choices}`,
        );
        return 'handled';
      }
      cart.productId = product.id;
      this.logToolCall('select_product', store.id, phone, { productId: product.id, productName: product.title });
      const variants = product.variants ?? [];
      if (variants.length > 1) {
        cart.step = 'variant';
        await this.carts.save(cart);
        const choices = variants
          .slice(0, 10)
          .map((item, index) => `${index + 1}. ${item.title} — ${item.price ?? product.price} ${store.currency}`)
          .join('\n');
        await this.reply(
          sessionId,
          chatId,
          `Choisissez une option pour ${product.title}. Répondez avec le numéro :\n${choices}`,
        );
      } else {
        const variant = variants[0];
        cart.variantId = this.providerVariantId(store.provider, variant);
        cart.variantTitle = String(variant?.title ?? 'Default Title');
        cart.step = 'quantity';
        await this.carts.save(cart);
        await this.reply(sessionId, chatId, `Combien d’unités de ${product.title} souhaitez-vous ?`);
      }
      return 'handled';
    }

    const product = products.find(item => item.id === cart.productId);
    if (!product) {
      await this.carts.delete(cart.id);
      return 'not_handled';
    }
    if (cart.step === 'variant') return this.selectVariant(input, cart, product);
    if (cart.step === 'quantity') return this.collectQuantity(input, cart, product);
    if (cart.step === 'name') {
      cart.customerName = text.slice(0, 150);
      cart.step = 'address';
      await this.carts.save(cart);
      await this.reply(sessionId, chatId, 'Quelle est votre adresse de livraison (rue, numéro et quartier) ?');
      return 'handled';
    }
    if (cart.step === 'address') {
      cart.address1 = text.slice(0, 300);
      cart.step = 'city';
      await this.carts.save(cart);
      await this.reply(sessionId, chatId, 'Dans quelle ville ?');
      return 'handled';
    }
    if (cart.step === 'city') return this.collectCity(input, cart, product);
    if (cart.step === 'confirm') return this.confirm(input, cart, product);
    if (cart.step === 'creating') {
      await this.reply(sessionId, chatId, 'Votre commande est déjà en cours de création. Merci de patienter.');
      return 'handled';
    }
    return 'not_handled';
  }

  private async selectVariant(
    input: CartConversationInput,
    cart: StoreOrderCart,
    product: Product,
  ): Promise<CartConversationResult> {
    const variants = product.variants ?? [];
    const selectedNumber = this.choiceNumber(input.text, variants.length);
    const variant = selectedNumber
      ? variants[selectedNumber - 1]
      : variants.find(item => input.text.toLowerCase().includes(String(item.title ?? '').toLowerCase()));
    if (!variant) {
      const choices = variants
        .slice(0, 10)
        .map((item, index) => `${index + 1}. ${item.title}`)
        .join('\n');
      await this.reply(
        input.sessionId,
        input.chatId,
        `Je n’ai pas reconnu l’option. Répondez avec un numéro :\n${choices}`,
      );
      return 'handled';
    }
    cart.variantId = this.providerVariantId(input.store.provider, variant);
    cart.variantTitle = String(variant.title);
    cart.step = 'quantity';
    await this.carts.save(cart);
    await this.reply(input.sessionId, input.chatId, 'Quelle quantité souhaitez-vous ?');
    return 'handled';
  }

  private async collectQuantity(
    input: CartConversationInput,
    cart: StoreOrderCart,
    product: Product,
  ): Promise<CartConversationResult> {
    const affirmative = /^(?:yes|oui|نعم|اه|آه|wakha|واخا)$/i.test(input.text.trim());
    const quantity = affirmative ? 1 : Number(input.text.match(/\d+/)?.[0]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      await this.reply(input.sessionId, input.chatId, 'Indiquez une quantité entre 1 et 99.');
      return 'handled';
    }
    cart.quantity = quantity;
    cart.step = 'name';
    await this.carts.save(cart);
    await this.reply(
      input.sessionId,
      input.chatId,
      `Quel est votre nom complet pour la livraison de ${product.title} ?`,
    );
    return 'handled';
  }

  private async collectCity(
    input: CartConversationInput,
    cart: StoreOrderCart,
    product: Product,
  ): Promise<CartConversationResult> {
    cart.city = input.text.slice(0, 100);
    cart.step = 'confirm';
    await this.carts.save(cart);
    const variant = (product.variants ?? []).find(
      item => this.providerVariantId(input.store.provider, item) === cart.variantId,
    );
    const unitPrice = Number(variant?.price ?? product.price);
    const summary = `Résumé de votre nouvelle commande :\n• ${product.title}${cart.variantTitle && cart.variantTitle !== 'Default Title' ? ` — ${cart.variantTitle}` : ''}\n• Quantité : ${cart.quantity}\n• Total produits : ${(unitPrice * cart.quantity).toFixed(2)} ${input.store.currency}\n• Livraison : ${cart.customerName}, ${cart.address1}, ${cart.city}\n• Téléphone : +${input.phone}`;
    await this.reply(
      input.sessionId,
      input.chatId,
      `${summary}\n\n✅ Répondez *CONFIRMER* pour créer la commande.\n❌ Répondez *ANNULER* pour arrêter.`,
    );
    return 'handled';
  }

  private async confirm(
    input: CartConversationInput,
    cart: StoreOrderCart,
    product: Product,
  ): Promise<CartConversationResult> {
    if (!/\b(confirm|confirmer|confirme|nconfirm|yes|oui|wakha)\w*\b|تأكيد|أؤكد|اؤكد|نعم/i.test(input.text)) {
      await this.reply(
        input.sessionId,
        input.chatId,
        'Répondez CONFIRMER pour créer la commande, ou ANNULER pour arrêter.',
      );
      return 'handled';
    }
    const claim = await this.carts.update({ id: cart.id, step: 'confirm' }, { step: 'creating' });
    if ((claim.affected ?? 0) !== 1) {
      await this.reply(input.sessionId, input.chatId, 'Votre commande est déjà en cours de création.');
      return 'handled';
    }
    cart.step = 'creating';
    const settings = this.encryption.revealSettings(input.store.settings ?? {});
    let execution: CommerceToolExecution | undefined;
    try {
      execution = await this.executions.start({
        operationKey: `cart:create:${cart.id}:${input.messageId ?? Date.now()}`,
        storeId: input.store.id,
        sessionId: input.sessionId,
        messageId: input.messageId,
        customerPhone: input.phone,
        provider: input.store.provider,
        tool: 'create_order',
        input: {
          cartId: cart.id,
          productId: product.id,
          variantId: cart.variantId,
          quantity: cart.quantity,
        },
      });
      const provider = this.providers.get(input.store.provider);
      if (!providerSupports(provider, 'createOrder')) throw new Error(`${input.store.provider} cannot create orders.`);
      const result = await provider.createOrder(
        { storeId: input.store.id, credentials: settings },
        {
          productId: product.externalProductId,
          variantId: cart.variantId,
          price: Number(product.price),
          quantity: cart.quantity,
          phone: `+${input.phone}`,
          customerName: String(cart.customerName),
          address1: String(cart.address1),
          city: String(cart.city),
          postalCode: cart.postalCode,
          country: cart.country,
        },
      );
      await this.carts.delete(cart.id);
      await this.executions.succeed(execution, {
        providerOrderId: result.orderId,
        orderNumber: result.orderName,
      });
      this.logToolCall('create_order', input.store.id, input.phone, {
        productId: product.id,
        quantity: cart.quantity,
        provider: input.store.provider,
        orderNumber: result.orderName ?? null,
      });
      await this.reply(
        input.sessionId,
        input.chatId,
        `Votre commande ${result.orderName ?? ''} a été créée et confirmée avec succès ✅`,
      );
    } catch (error) {
      if (execution) await this.executions.fail(execution, error);
      cart.step = 'confirm';
      await this.carts.update({ id: cart.id, step: 'creating' }, { step: 'confirm' });
      this.logger.error(
        `Chat order creation failed (store=${input.store.id}, customer=${input.phone.slice(-4)}): ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.reply(
        input.sessionId,
        input.chatId,
        `Je n’ai pas pu créer la commande dans ${input.store.provider} pour le moment. Vos informations sont conservées; répondez CONFIRMER pour réessayer ou ANNULER.`,
      );
    }
    return 'handled';
  }

  private providerVariantId(provider: Platform, variant: Record<string, unknown> | undefined): string {
    const id = this.scalarString(variant?.id);
    if ([Platform.WOOCOMMERCE, Platform.YOUCAN].includes(provider)) return id;
    return this.scalarString(variant?.admin_graphql_api_id) || (id ? `gid://shopify/ProductVariant/${id}` : '');
  }

  private scalarString(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  private hasPurchaseIntent(text: string): boolean {
    return /\b(?:buy|purchase|commander|acheter|achete|nchri|nakhod|nakhdo|nakhdoh|ncommandi)\b|\b(?:i want|i need|want to|would like to)\s+(?:buy|purchase|order|create|place)\b|\b(?:create|place|make|start|continue|complete)\s+(?:a\s+|an\s+|new\s+)?(?:order|purchase)\b|\b(?:je veux|je voudrais|j aimerais|on peut|peux tu|pouvez vous)\s+(?:commander|acheter|créer|creer|faire|passer|démarrer|demarrer|continuer)\b|\b(?:créer|creer|faire|passer|démarrer|demarrer|continuer|finaliser)\s+(?:une?\s+)?(?:commande|order)\b|\bbghit\s+(?:nchri|nakhod|nakhdo|nakhdoh|ncommandi|ndir|ndor|ndiro|ncreer|nkml|nkemel)\b|\b(?:ndir|ndor|ndiro|ncreer|cree|créer|nkml|nkemel|tkmel)\s+(?:order|commande|talab|talabiya)\b|\b(?:commande|order|talab|talabiya)\s+(?:jdida|jdid|nouvelle|new)\b|(?:بغيت|أريد)\s+(?:نشتري|نطلب|شراء|ناخد|ناخدو|ناخذه|ندير)|(?:ندير|نكمل|دير|دوز|أنشئ|انشئ)\s+(?:طلب|الطلب|طلبية)/i.test(
      text,
    );
  }

  private hasReferentialPurchaseIntent(text: string): boolean {
    return /\b(?:nakhod|nakhdo|nakhdoh|take it|buy it|this one|nkml|nkemel|tkmel|continue|complete)\b|(?:ناخد|ناخدو|ناخذه|هذا|هادا|نكمل|كمل)/i.test(
      text,
    );
  }

  private async recentlyMentionedProduct(
    sessionId: string,
    chatId: string,
    products: Product[],
  ): Promise<Product | undefined> {
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
    const exact = [...products]
      .sort((left, right) => right.title.length - left.title.length)
      .find(product => normalized.includes(product.title.toLowerCase()));
    if (exact) return exact;
    const terms = normalized.split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
    const ranked = products
      .map(product => ({
        product,
        score: terms.filter(term => product.title.toLowerCase().includes(term)).length,
      }))
      .sort((left, right) => right.score - left.score);
    return ranked[0]?.score > 0 && ranked[0].score > (ranked[1]?.score ?? -1) ? ranked[0].product : undefined;
  }

  private choiceNumber(text: string, maximum: number): number | null {
    const match = text.trim().match(/^(?:option\s*)?(\d{1,2})[.)]?$/i);
    if (!match) return null;
    const value = Number(match[1]);
    return value >= 1 && value <= Math.min(maximum, 10) ? value : null;
  }

  private reply(sessionId: string, chatId: string, text: string) {
    return this.voice.sendReply(sessionId, { chatId, text });
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
}
