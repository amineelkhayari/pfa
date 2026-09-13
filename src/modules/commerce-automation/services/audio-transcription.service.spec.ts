import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AudioTranscriptionService } from './audio-transcription.service';

describe('AudioTranscriptionService provider errors', () => {
  const originalFetch = global.fetch;
  const config = {
    audioSttModel: jest.fn().mockReturnValue('deepgram/nova-3'),
    audioSttLanguage: jest.fn().mockReturnValue('ar-MA'),
    audioTtsModel: jest.fn().mockReturnValue('deepgram/aura-2-thalia-en'),
    audioVoice: jest.fn().mockReturnValue(''),
    audioOutputFormat: jest.fn().mockReturnValue('mp3'),
    aiApiKey: jest.fn().mockReturnValue('test-key'),
    aiBaseUrl: jest.fn().mockReturnValue('https://api.omniroute.example/v1/chat/completions'),
  };
  let service: AudioTranscriptionService;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new AudioTranscriptionService(config as any);
  });
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('reports inaccessible STT models as an actionable configuration error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 403,
      json: async () => ({ error: { message: 'Project does not have access to the requested model.' } }),
    }) as any;

    await expect(service.transcribe({ buffer: Buffer.from('audio'), mimetype: 'audio/ogg', originalname: 'voice.ogg' }))
      .rejects.toThrow(new BadRequestException('The OmniRoute project does not have access to transcription model "deepgram/nova-3". Enable this model in OmniRoute or select an accessible Speech-to-text model in Admin > AI settings.'));
  });

  it('preserves the Moroccan Arabic locale instead of reducing it to generic Arabic', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'سلام' }) }) as any;

    await service.transcribe({ buffer: Buffer.from('audio'), mimetype: 'audio/ogg', originalname: 'voice.ogg' }, 'ar-MA');

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(request.body.get('language')).toBe('ar-MA');
  });

  it('keeps temporary upstream failures as service unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 503,
      json: async () => ({ error: { message: 'Provider temporarily unavailable' } }),
    }) as any;

    await expect(service.transcribe({ buffer: Buffer.from('audio'), mimetype: 'audio/ogg', originalname: 'voice.ogg' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
