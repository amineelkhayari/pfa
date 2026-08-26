import { Body, Controller, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequireRole, RequireUnscopedKey } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { Order } from '../../stores/entities/order.entity';
import { CommerceAiAgentService } from '../services/commerce-ai-agent.service';
import { AiConversationTurn } from '../../stores/entities/order-ai-conversation.entity';
import { StoreService } from '../../stores/store.service';
import { Product } from '../../stores/entities/product.entity';

type SimulatedToolCall = { tool: string; input: Record<string, unknown>; result: Record<string, unknown> };

function productStock(product: Product): number | null {
  const values = (product.variants ?? [])
    .map(variant => Number(variant.inventory_quantity ?? variant.inventoryQuantity))
    .filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function simulateTools(message: string, products: Product[], currency: string): SimulatedToolCall[] {
  const normalized = message.toLocaleLowerCase();
  const ignored = new Set(['avec', 'avoir', 'avez', 'vous', 'votre', 'dans', 'pour', 'quoi', 'quel', 'quelle', 'produit', 'produits', 'bghit', 'wach', '3ndkom', 'je', 'un', 'une', 'des', 'les']);
  const words = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(word => word.length > 2 && !ignored.has(word));
  const matches = products.filter(product => {
    if (!words.length) return true;
    const haystack = [product.title, product.productType, product.vendor, ...(product.tags ?? [])].filter(Boolean).join(' ').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return words.some(word => haystack.includes(word));
  }).slice(0, 8);
  const selected = matches[0] ?? products.find(product => normalized.includes(product.title.toLocaleLowerCase()));
  const calls: SimulatedToolCall[] = [{
    tool: 'search_products',
    input: { query: message },
    result: { count: matches.length, products: matches.map(product => ({ id: product.id, name: product.title, price: Number(product.price), currency, stock: productStock(product) })) },
  }];
  if (selected && (matches.length === 1 || normalized.includes(selected.title.toLocaleLowerCase()))) {
    calls.push({ tool: 'get_product_details', input: { product_id: selected.id }, result: { id: selected.id, name: selected.title, description: selected.description, price: Number(selected.price), currency, stock: productStock(selected), variants: selected.variants ?? [] } });
  }
  if (selected && /\b(acheter|commande|commander|prendre|confirm|bghit|nakhod|nakhd|want|buy)\b/i.test(normalized)) {
    const quantity = Math.max(1, Number(normalized.match(/\b(\d+)\b/)?.[1] ?? 1));
    calls.push({ tool: 'create_order', input: { product_id: selected.id, quantity }, result: { simulated: true, created: false, product_name: selected.title, quantity, total: Number(selected.price) * quantity, currency, status: 'awaiting_customer_details_and_confirmation' } });
  }
  return calls;
}

class TestAiDto {
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsArray() history?: Array<{ role?: string; text?: string }>;
  @IsOptional() @IsUUID() storeId?: string;
}

const sampleOrder = {
  id: 'test-order', shopifyOrderId: '1234', orderNumber: '#1234', customerName: 'Test Customer',
  lineItems: [{ title: 'Test product', quantity: 2 }], totalPrice: 300, currency: 'MAD',
  shippingAddress: { city: 'Casablanca', country: 'Morocco' },
} as unknown as Order;

@Controller('admin/ai-settings')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminAiTestController {
  constructor(private readonly agent: CommerceAiAgentService) {}

  @Post('test')
  async test(@Body() dto: TestAiDto) {
    if (!this.agent.enabled()) throw new Error('AI is disabled or its provider API key is missing');
    const message = dto.message?.trim() || 'Yes, everything is correct. I confirm my order.';
    const decision = await this.agent.respond(sampleOrder, 'English', [
      { role: 'customer', text: message, at: new Date().toISOString() },
    ]);
    return { success: true, provider: this.agent.provider(), model: this.agent.model(), decision };
  }
}

@Controller('ai')
@RequireRole(ApiKeyRole.OPERATOR)
export class UserAiTestController {
  constructor(
    private readonly agent: CommerceAiAgentService,
    private readonly stores: StoreService,
  ) {}

  @Post('test-chat')
  async chat(@Body() dto: TestAiDto) {
    if (!this.agent.enabled()) throw new Error('AI is disabled or its provider API key is missing');
    const message = dto.message?.trim();
    if (!message) throw new Error('A test message is required');
    const history: AiConversationTurn[] = (dto.history ?? []).slice(-10).flatMap(turn => {
      const role = turn.role === 'assistant' ? 'assistant' : turn.role === 'customer' ? 'customer' : null;
      const text = typeof turn.text === 'string' ? turn.text.trim().slice(0, 1000) : '';
      return role && text ? [{ role, text, at: new Date().toISOString() } as AiConversationTurn] : [];
    });
    const turns: AiConversationTurn[] = [
      ...history,
      { role: 'customer' as const, text: message, at: new Date().toISOString() },
    ];
    const store = dto.storeId ? await this.stores.findOneById(dto.storeId) : null;
    const products = store ? await this.stores.findProducts(store.id) : [];
    const orders = store ? await this.stores.findOrders(store.id) : [];
    const toolCalls = store ? simulateTools(message, products, store.currency) : [];
    const reply = await this.agent.chat(
      turns,
      store ? { name: store.name, language: store.language, products, orders: orders.slice(0, 20) } : undefined,
    );
    return {
      provider: this.agent.provider(),
      model: this.agent.model(),
      reply,
      toolCalls,
    };
  }
}
