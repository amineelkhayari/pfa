import { Injectable } from '@nestjs/common';
import { Product } from '../../stores/entities/product.entity';

export type CommerceToolCall = { tool: string; input: Record<string, unknown>; result: Record<string, unknown> };
export type CommerceFunctionTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

@Injectable()
export class CommerceToolService {
  definitions(): CommerceFunctionTool[] {
    return [
      this.tool('search_products', 'Search the current store catalogue. Use this before quoting products, prices, variants, availability, or selecting a product.', {
        type: 'object', additionalProperties: false,
        properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 8 } },
        required: ['query'],
      }),
      this.tool('get_product_details', 'Get verified details and variants for one product from this store.', {
        type: 'object', additionalProperties: false,
        properties: { product_id: { type: 'string' } }, required: ['product_id'],
      }),
      this.tool('list_customer_orders', 'List real orders belonging to the current WhatsApp phone number.', {
        type: 'object', additionalProperties: false, properties: {},
      }),
      this.tool('get_order_details', 'Get a real customer order by its displayed order number.', {
        type: 'object', additionalProperties: false,
        properties: { order_number: { type: 'string' } }, required: ['order_number'],
      }),
      this.tool('start_new_order', 'Start a persisted checkout cart for a verified catalogue product. This does not create a Shopify/WooCommerce order. After the result, ask only for result.next_required.', {
        type: 'object', additionalProperties: false,
        properties: {
          product_id: { type: 'string' },
          variant_id: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 99 },
        },
        required: ['product_id'],
      }),
      this.tool('get_active_cart', 'Read the persisted checkout state and identify the next required customer detail.', {
        type: 'object', additionalProperties: false, properties: {},
      }),
      this.tool('get_store_information', 'Get verified live store profile, policies/terms, shipping zones/rates, and enabled payment information. Always use this for questions about the store, delivery, shipping, payment, refund, privacy, or terms. Never expose credentials.', {
        type: 'object', additionalProperties: false, properties: {},
      }),
      this.tool('prepare_shipping_address_update', 'Validate and prepare a shipping-address change for one real customer order. This does not mutate Shopify/WooCommerce. Show the returned preview and ask the customer to reply CONFIRMER.', {
        type: 'object', additionalProperties: false,
        properties: {
          order_number: { type: 'string' },
          customer_name: { type: 'string' },
          address1: { type: 'string' },
          city: { type: 'string' },
          postal_code: { type: 'string' },
          country: { type: 'string' },
        },
        required: ['order_number', 'customer_name', 'address1', 'city'],
      }),
      this.tool('apply_shipping_address_update', 'Apply a previously prepared shipping update. Call only when the latest customer message explicitly says CONFIRMER and includes or clearly refers to the prepared order.', {
        type: 'object', additionalProperties: false,
        properties: { order_number: { type: 'string' } }, required: ['order_number'],
      }),
    ];
  }

  stock(product: Product): number | null {
    const values = (product.variants ?? [])
      .map(variant => Number(variant.inventory_quantity ?? variant.inventoryQuantity))
      .filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  searchProducts(query: string, products: Product[], currency: string, limit = 8): { products: Product[]; call: CommerceToolCall } {
    const normalized = this.normalize(query);
    const ignored = new Set(['avec', 'avoir', 'avez', 'vous', 'votre', 'dans', 'pour', 'quoi', 'quel', 'quelle', 'produit', 'produits', 'bghit', 'wach', '3ndkom', 'je', 'un', 'une', 'des', 'les']);
    const words = normalized.split(/[^a-z0-9]+/).filter(word => word.length > 2 && !ignored.has(word));
    const ranked = products
      .map(product => ({ product, score: words.reduce((score, word) => score + (this.productText(product).includes(word) ? 1 : 0), 0) }))
      .sort((left, right) => right.score - left.score);
    const matched = ranked.filter(item => item.score > 0).slice(0, limit).map(item => item.product);
    const selected = matched.length ? matched : ranked.slice(0, limit).map(item => item.product);
    return {
      products: selected,
      call: {
        tool: 'search_products', input: { query },
        result: { count: selected.length, products: selected.map(product => ({ id: product.id, name: product.title, price: Number(product.price), currency, stock: this.stock(product) })) },
      },
    };
  }

  simulate(message: string, products: Product[], currency: string): CommerceToolCall[] {
    const search = this.searchProducts(message, products, currency);
    const normalized = message.toLocaleLowerCase();
    const selected = search.products[0];
    const calls = [search.call];
    if (selected && (search.products.length === 1 || normalized.includes(selected.title.toLocaleLowerCase()))) {
      calls.push({ tool: 'get_product_details', input: { product_id: selected.id }, result: { id: selected.id, name: selected.title, description: selected.description, price: Number(selected.price), currency, stock: this.stock(selected), variants: selected.variants ?? [] } });
    }
    if (selected && /\b(acheter|commande|commander|prendre|confirm|bghit|nakhod|nakhd|want|buy)\b/i.test(normalized)) {
      const quantity = Math.max(1, Number(normalized.match(/\b(\d+)\b/)?.[1] ?? 1));
      calls.push({ tool: 'create_order', input: { product_id: selected.id, quantity }, result: { simulated: true, created: false, product_name: selected.title, quantity, total: Number(selected.price) * quantity, currency, status: 'awaiting_customer_details_and_confirmation' } });
    }
    return calls;
  }

  private normalize(value: string): string {
    return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private productText(product: Product): string {
    return this.normalize([product.title, product.productType, product.vendor, ...(product.tags ?? [])].filter(Boolean).join(' '));
  }

  private tool(name: string, description: string, parameters: Record<string, unknown>): CommerceFunctionTool {
    return { type: 'function', function: { name, description, parameters } };
  }
}
