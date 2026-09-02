import { Body, Controller, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequireRole, RequireUnscopedKey } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { Order } from '../../stores/entities/order.entity';
import { CommerceAiAgentService } from '../services/commerce-ai-agent.service';
import { AiConversationTurn } from '../../stores/entities/order-ai-conversation.entity';
import { StoreService } from '../../stores/store.service';
import { CommerceToolService } from '../services/commerce-tool.service';
import { AudioTranscriptionService } from '../services/audio-transcription.service';

class TestAiDto {
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsArray() history?: Array<{ role?: string; text?: string }>;
  @IsOptional() @IsUUID() storeId?: string;
}

class TestSpeechDto {
  @IsString() @MaxLength(4096) text!: string;
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
    private readonly tools: CommerceToolService,
    private readonly audio: AudioTranscriptionService,
  ) {}

  @Post('test-chat/transcribe')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  transcribe(@UploadedFile() file?: { buffer?: Buffer; mimetype?: string; originalname?: string; size?: number }) {
    return this.audio.transcribe(file);
  }

  @Post('test-chat/speech')
  async speech(@Body() dto: TestSpeechDto, @Res({ passthrough: true }) response: Response) {
    const audio = await this.audio.synthesize(dto.text);
    response.setHeader('Content-Type', audio.contentType);
    response.setHeader('Content-Disposition', 'inline; filename="ai-reply.mp3"');
    response.setHeader('X-Audio-Model', audio.model);
    return new StreamableFile(audio.data);
  }

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
    const toolCalls = store ? this.tools.simulate(message, products, store.currency) : [];
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
