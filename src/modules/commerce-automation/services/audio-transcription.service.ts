import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BillingConfigService } from '../../billing/billing-config.service';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

@Injectable()
export class AudioTranscriptionService {
  constructor(private readonly config: BillingConfigService) {}

  async transcribe(file?: { buffer?: Buffer; mimetype?: string; originalname?: string; size?: number }, language?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('An audio file is required.');
    if (file.buffer.length > MAX_AUDIO_BYTES) throw new BadRequestException('Audio files are limited to 20 MB.');
    const mime = String(file.mimetype ?? '').toLowerCase();
    const supportedName = /\.(mp3|wav|m4a|flac|ogg|opus|webm)$/i.test(file.originalname ?? '');
    if (!mime.startsWith('audio/') && mime !== 'application/ogg' && !supportedName) {
      throw new BadRequestException('Only audio files are supported.');
    }

    const endpoint = this.audioEndpoint('transcriptions');
    const model = this.config.audioSttModel();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'voice.ogg');
    form.append('model', model);
    if (language?.trim()) form.append('language', language.trim().toLowerCase().split(/[-_]/)[0]);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.aiApiKey()}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(`Unable to reach audio transcription provider: ${error instanceof Error ? error.message : 'request failed'}`);
    }

    const payload = await response.json().catch(() => ({})) as { text?: unknown; noSpeechDetected?: unknown; error?: { message?: unknown }; message?: unknown; detail?: unknown };
    if (!response.ok) {
      const detail = this.providerError(payload, response.status);
      throw new ServiceUnavailableException(`Audio transcription failed: ${detail}`);
    }
    if (typeof payload.text !== 'string' || !payload.text.trim()) {
      const reason = payload.noSpeechDetected === true ? 'no recognizable speech was detected' : 'the provider returned no text';
      throw new ServiceUnavailableException(`Audio provider returned an empty transcription (${reason}; model=${model}; mime=${file.mimetype || 'unknown'}; bytes=${file.buffer.length}).`);
    }
    return { text: payload.text.trim().slice(0, 1000), model };
  }

  async synthesize(text: string): Promise<{ data: Buffer; contentType: string; model: string }> {
    const input = text.trim().slice(0, 4096);
    if (!input) throw new BadRequestException('Text is required for speech generation.');
    const model = this.config.audioTtsModel();
    const voiceId = this.config.audioVoice();
    const outputFormat = this.config.audioOutputFormat();
    const endpoint = this.audioEndpoint('speech');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.aiApiKey()}`, Accept: 'audio/mpeg', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input,
          voice: voiceId,
          response_format: outputFormat,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(`Unable to reach speech provider: ${error instanceof Error ? error.message : 'request failed'}`);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: { message?: unknown }; message?: unknown; detail?: unknown };
      const detail = this.providerError(payload, response.status);
      throw new ServiceUnavailableException(`Speech generation failed: ${detail}`);
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length) throw new ServiceUnavailableException('Speech provider returned empty audio.');
    return { data, contentType: response.headers.get('content-type')?.split(';')[0] || 'audio/mpeg', model };
  }

  private audioEndpoint(operation: 'transcriptions' | 'speech'): string {
    const configured = this.config.aiBaseUrl().trim();
    if (!configured) throw new ServiceUnavailableException('Configure the OmniRoute endpoint URL before testing audio.');
    try {
      const url = new URL(configured);
      url.pathname = url.pathname.replace(/\/(chat\/completions|responses)\/?$/, '').replace(/\/$/, '') + `/audio/${operation}`;
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      throw new ServiceUnavailableException('The configured OmniRoute URL is invalid.');
    }
  }

  private providerError(payload: { error?: { message?: unknown }; message?: unknown; detail?: unknown }, status: number): string {
    if (typeof payload.error?.message === 'string') return payload.error.message;
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.detail === 'string') return payload.detail;
    if (payload.detail) return JSON.stringify(payload.detail);
    return `HTTP ${status}`;
  }

}
