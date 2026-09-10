import { Injectable } from '@nestjs/common';
import { createLogger } from '../../../common/services/logger.service';
import { PlanUsageService } from '../../auth/plan-usage.service';
import { MessageService } from '../../message/message.service';
import { AudioTranscriptionService } from './audio-transcription.service';

export interface IncomingCommerceAudio {
  mimetype?: string;
  filename?: string;
  data?: string;
  omitted?: boolean;
}

@Injectable()
export class CommerceVoiceService {
  private readonly logger = createLogger('CommerceVoiceService');
  private readonly audioReplyChats = new Map<string, number>();

  constructor(
    private readonly messages: MessageService,
    private readonly audio: AudioTranscriptionService,
    private readonly planUsage: PlanUsageService,
  ) {}

  async transcribeIncoming(
    sessionId: string,
    chatId: string | undefined,
    media: IncomingCommerceAudio | undefined,
    language?: string,
  ): Promise<string | undefined> {
    if (!chatId || !media?.data || media.omitted) {
      this.logger.warn(`Incoming voice note has no downloadable media sessionId=${sessionId}`);
      return undefined;
    }
    if (!(await this.planUsage.reserveAudioTranscription(sessionId))) {
      await this.messages.sendText(sessionId, {
        chatId,
        text: 'La transcription des messages vocaux n’est pas incluse dans votre forfait ou votre quota est épuisé. Passez à un forfait supérieur pour l’activer.',
      });
      return undefined;
    }
    try {
      const result = await this.audio.transcribe(
        {
          buffer: Buffer.from(media.data, 'base64'),
          mimetype: media.mimetype || 'audio/ogg',
          originalname: media.filename || 'whatsapp-voice.ogg',
        },
        language,
      );
      return result.text;
    } catch (error) {
      await this.planUsage.releaseAudioTranscription(sessionId);
      this.logger.error(
        `WhatsApp voice transcription failed sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.messages.sendText(sessionId, {
        chatId,
        text: 'Je n’ai pas pu comprendre ce message vocal. Réessayez ou envoyez-moi un message texte.',
      });
      return undefined;
    }
  }

  async withAudioReply<T>(chatId: string, action: () => Promise<T>): Promise<T> {
    this.audioReplyChats.set(chatId, (this.audioReplyChats.get(chatId) ?? 0) + 1);
    try {
      return await action();
    } finally {
      const remaining = (this.audioReplyChats.get(chatId) ?? 1) - 1;
      if (remaining > 0) this.audioReplyChats.set(chatId, remaining);
      else this.audioReplyChats.delete(chatId);
    }
  }

  async sendReply(sessionId: string, dto: { chatId: string; text: string }) {
    if (!this.audioReplyChats.has(dto.chatId)) return this.messages.sendText(sessionId, dto);
    if (!(await this.planUsage.reserveAudioReply(sessionId))) return this.messages.sendText(sessionId, dto);
    try {
      const speech = await this.audio.synthesize(dto.text);
      const voiceNoteCompatible = /(?:audio\/(?:ogg|opus)|opus)/i.test(speech.contentType);
      const extension = /wav/i.test(speech.contentType) ? 'wav' : voiceNoteCompatible ? 'ogg' : 'mp3';
      return await this.messages.sendAudio(sessionId, {
        chatId: dto.chatId,
        base64: speech.data.toString('base64'),
        mimetype: speech.contentType,
        filename: `assistant-reply.${extension}`,
        // WhatsApp PTT only accepts Ogg/Opus. Other formats remain playable audio attachments.
        ptt: voiceNoteCompatible,
      });
    } catch (error) {
      await this.planUsage.releaseAudioReply(sessionId);
      this.logger.error(
        `WhatsApp voice generation failed sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.messages.sendText(sessionId, dto);
    }
  }
}
