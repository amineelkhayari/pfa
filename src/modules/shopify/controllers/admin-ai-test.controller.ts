import { Body, Controller, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequireRole, RequireUnscopedKey } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { Order } from '../../stores/entities/order.entity';
import { OpenAiOrderAgentService } from '../services/openai-order-agent.service';
import { AiConversationTurn } from '../entities/order-ai-conversation.entity';

class TestAiDto {
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsArray() history?: Array<{ role?: string; text?: string }>;
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
  constructor(private readonly agent: OpenAiOrderAgentService) {}

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
  constructor(private readonly agent: OpenAiOrderAgentService) {}

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
    const reply = await this.agent.chat(turns);
    return { provider: this.agent.provider(), model: this.agent.model(), reply };
  }
}
