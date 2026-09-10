import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationProviderRegistry } from '../../../commerce/integration-provider.registry';
import { providerSupports } from '../../../commerce/integration-provider.interface';
import { normalizePhone } from '../../../common/utils/phone.util';
import { CredentialEncryptionService } from '../../../common/security/credential-encryption.service';
import { createLogger } from '../../../common/services/logger.service';
import { OrderAiConversation } from '../../stores/entities/order-ai-conversation.entity';
import { Order } from '../../stores/entities/order.entity';
import { Product } from '../../stores/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { CommerceVoiceService } from './commerce-voice.service';

type Turn = { role: 'customer' | 'assistant'; text: string; at: string };

@Injectable()
export class CommerceOrderActionService {
  private readonly logger = createLogger('CommerceOrderActionService');

  constructor(
    private readonly providers: IntegrationProviderRegistry,
    private readonly encryption: CredentialEncryptionService,
    private readonly voice: CommerceVoiceService,
    @InjectRepository(Order, 'data') private readonly orders: Repository<Order>,
    @InjectRepository(Product, 'data') private readonly products: Repository<Product>,
    @InjectRepository(OrderAiConversation, 'data') private readonly conversations: Repository<OrderAiConversation>,
  ) {}

  directAction(text: string): 'confirm' | 'cancel' | null {
    if (text.trim() === '1') return 'confirm';
    if (text.trim() === '2') return 'cancel';
    const normalized = text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
    if (
      /\b(?:cancel|cancelled|annuler|annule|je veux annuler|bghit ncancel|ma bghit|la ma bghitch)\w*\b|إلغاء|الغاء|ألغي|لا أريد/.test(
        normalized,
      )
    )
      return 'cancel';
    return /\b(?:confirm|confirmed|confirmer|confirme|je confirme|yes confirm|oui je confirme|bghit nconfirm|wakha confirm)\w*\b|أؤكد|اؤكد|تأكيد|نعم أؤكد/.test(
      normalized,
    )
      ? 'confirm'
      : null;
  }

  hasAddressChangeIntent(text: string): boolean {
    return /(?:change|modifier|corriger|update).{0,25}(?:adresse|address|livraison)|(?:adresse|address).{0,25}(?:change|modifier|corriger)|بدل.{0,15}العنوان|تغيير.{0,15}العنوان|bdel.{0,15}(?:adresse|address)/i.test(
      text,
    );
  }

  async apply(store: Store, order: Order, action: 'confirm' | 'cancel'): Promise<void> {
    order.confirmationStatus = 'processing_reply';
    order.confirmationError = null;
    await this.orders.save(order);
    try {
      const credentials = this.encryption.revealSettings(store.settings ?? {});
      const provider = this.providers.get(store.provider);
      const connection = { storeId: store.id, credentials };
      if (action === 'confirm') {
        if (!providerSupports(provider, 'confirmOrder')) throw new Error(`${store.provider} cannot confirm orders.`);
        await provider.confirmOrder(connection, order);
      } else {
        if (!providerSupports(provider, 'cancelOrder')) throw new Error(`${store.provider} cannot cancel orders.`);
        await provider.cancelOrder(connection, order);
      }
      order.status = action === 'confirm' ? 'confirmed' : 'cancelled';
      order.confirmationStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
      await this.orders.save(order);
    } catch (error) {
      order.confirmationStatus = 'pending';
      order.confirmationError = error instanceof Error ? error.message : 'Unable to update provider order.';
      await this.orders.save(order);
      throw error;
    }
  }

  async executeDirect(sessionId: string, chatId: string, store: Store, order: Order, action: 'confirm' | 'cancel') {
    try {
      await this.apply(store, order, action);
      const text =
        action === 'confirm'
          ? await this.confirmationMessage(store, order)
          : `Votre commande ${order.orderNumber ?? ''} a été annulée.`;
      await this.voice.sendReply(sessionId, { chatId, text });
    } catch (error) {
      this.logger.error(
        `Failed to process ${store.provider} order reply (session=${sessionId}, order=${order.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async startAddressChange(conversation: OrderAiConversation, turns: Turn[], sessionId: string, chatId: string) {
    conversation.pendingAction = 'collect_shipping_address';
    conversation.pendingData = null;
    conversation.turns = [
      ...turns,
      {
        role: 'assistant',
        text: 'Envoyez la nouvelle livraison sous cette forme : Nom complet | Adresse | Ville | Code postal (optionnel) | Pays',
        at: new Date().toISOString(),
      },
    ];
    await this.conversations.save(conversation);
    await this.voice.sendReply(sessionId, {
      chatId,
      text: 'Bien sûr. Envoyez la nouvelle livraison sous cette forme :\n*Nom complet | Adresse | Ville | Code postal (optionnel) | Pays*\n\nExemple : Amine Alaoui | 15 rue Hassan II | Rabat | 10000 | Morocco',
    });
  }

  async handlePendingEdit(
    sessionId: string,
    chatId: string,
    store: Store,
    order: Order,
    conversation: OrderAiConversation,
    text: string,
    turns: Turn[],
  ): Promise<boolean> {
    if (!conversation.pendingAction) return false;
    if (/^(?:annuler|cancel|stop|la|non|لا|إلغاء)$/i.test(text.trim())) {
      conversation.pendingAction = null;
      conversation.pendingData = null;
      await this.conversations.save(conversation);
      await this.voice.sendReply(sessionId, { chatId, text: 'D’accord, la modification de livraison a été annulée.' });
      return true;
    }
    if (conversation.pendingAction === 'collect_shipping_address') {
      const parts = text.split('|').map(value => value.trim());
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        await this.voice.sendReply(sessionId, {
          chatId,
          text: 'Je n’ai pas pu lire toutes les informations. Utilisez :\n*Nom complet | Adresse | Ville | Code postal (optionnel) | Pays*',
        });
        return true;
      }
      conversation.pendingData = {
        customerName: parts[0],
        address1: parts[1],
        city: parts[2],
        postalCode: parts[3] || undefined,
        country: parts[4] || String(order.shippingAddress?.country ?? 'Morocco'),
        phone: order.phone ?? undefined,
      };
      conversation.pendingAction = 'confirm_shipping_address';
      const preview = `Nouvelle livraison pour ${order.orderNumber ?? order.externalOrderId} :\n• ${parts[0]}\n• ${parts[1]}, ${parts[2]}${parts[3] ? `, ${parts[3]}` : ''}\n• ${parts[4] || order.shippingAddress?.country || 'Morocco'}\n\nRépondez *CONFIRMER* pour appliquer ou *ANNULER*.`;
      conversation.turns = [...turns, { role: 'assistant', text: preview, at: new Date().toISOString() }];
      await this.conversations.save(conversation);
      await this.voice.sendReply(sessionId, { chatId, text: preview });
      return true;
    }
    if (conversation.pendingAction !== 'confirm_shipping_address') return false;
    if (!/^(?:confirmer|confirm|oui|yes|wakha|نعم|تأكيد)$/i.test(text.trim())) {
      await this.voice.sendReply(sessionId, {
        chatId,
        text: 'Répondez CONFIRMER pour appliquer la nouvelle adresse, ou ANNULER.',
      });
      return true;
    }
    if (!conversation.pendingData) return false;
    await this.updateShipping(store, order, conversation.pendingData);
    conversation.pendingAction = null;
    conversation.pendingData = null;
    await this.conversations.save(conversation);
    this.logger.log('Commerce tool executed', {
      action: 'commerce_tool_executed',
      tool: 'apply_shipping_address_update',
      storeId: store.id,
      customer: normalizePhone(order.phone).slice(-4),
    });
    await this.voice.sendReply(sessionId, {
      chatId,
      text: `L’adresse de livraison de la commande ${order.orderNumber ?? order.externalOrderId} a été mise à jour avec succès ✅`,
    });
    return true;
  }

  async updateShipping(
    store: Store,
    order: Order,
    data: {
      customerName: string;
      address1: string;
      city: string;
      postalCode?: string;
      country: string;
      phone?: string;
    },
  ) {
    const credentials = this.encryption.revealSettings(store.settings ?? {});
    const provider = this.providers.get(store.provider);
    if (!providerSupports(provider, 'updateShippingAddress'))
      throw new Error(`${store.provider} cannot update shipping addresses.`);
    await provider.updateShippingAddress({ storeId: store.id, credentials }, order, data);
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

  async confirmationMessage(store: Store, order: Order, aiReply?: string): Promise<string> {
    const settings = this.encryption.revealSettings(store.settings ?? {});
    const template =
      typeof settings.confirmationSuccessTemplate === 'string' && settings.confirmationSuccessTemplate.trim()
        ? settings.confirmationSuccessTemplate
        : 'Merci {{customerName}}, votre commande {{orderNumber}} est confirmée ✅';
    const render = (value: string, data: Record<string, string>) =>
      value.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (match, key: string) => data[key] ?? match).trim();
    const base =
      aiReply?.trim() ||
      render(template, {
        customerName: order.customerName ?? '',
        orderNumber: order.orderNumber ?? order.externalOrderId,
        storeName: store.name,
      });
    const products = await this.products.find({
      where: { storeId: store.id, status: 'active' },
      order: { externalUpdatedAt: 'DESC' },
      take: 40,
    });
    const ordered = new Set(
      (order.lineItems ?? [])
        .map(item =>
          String(item.title ?? item.name ?? '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const related = products.filter(product => !ordered.has(product.title.trim().toLowerCase())).slice(0, 3);
    if (!related.length) return base;
    const lines = related
      .map(product => `• ${product.title} — ${product.price} ${order.currency || store.currency}`)
      .join('\n');
    const recommendation =
      typeof settings.relatedProductsTemplate === 'string' && settings.relatedProductsTemplate.trim()
        ? settings.relatedProductsTemplate
        : 'Vous pourriez aussi aimer :\n{{products}}\n\nRépondez avec le nom du produit pour plus d’informations.';
    return `${base}\n\n${render(recommendation, { products: lines, storeName: store.name, orderNumber: order.orderNumber ?? order.externalOrderId })}`;
  }
}
