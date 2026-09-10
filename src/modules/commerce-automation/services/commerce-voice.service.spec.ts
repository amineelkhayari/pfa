import { PlanUsageService } from '../../auth/plan-usage.service';
import { MessageService } from '../../message/message.service';
import { AudioTranscriptionService } from './audio-transcription.service';
import { CommerceVoiceService } from './commerce-voice.service';

describe('CommerceVoiceService', () => {
  const sendText = jest.fn();
  const sendAudio = jest.fn();
  const transcribe = jest.fn();
  const synthesize = jest.fn();
  const reserveAudioTranscription = jest.fn();
  const releaseAudioTranscription = jest.fn();
  const reserveAudioReply = jest.fn();
  const releaseAudioReply = jest.fn();
  const service = new CommerceVoiceService(
    { sendText, sendAudio } as unknown as MessageService,
    { transcribe, synthesize } as unknown as AudioTranscriptionService,
    {
      reserveAudioTranscription,
      releaseAudioTranscription,
      reserveAudioReply,
      releaseAudioReply,
    } as unknown as PlanUsageService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('transcribes downloadable WhatsApp audio after reserving quota', async () => {
    reserveAudioTranscription.mockResolvedValue(true);
    transcribe.mockResolvedValue({ text: 'salam', model: 'stt-model' });

    await expect(
      service.transcribeIncoming(
        'session-1',
        '212600000000@c.us',
        { data: Buffer.from('audio').toString('base64'), mimetype: 'audio/ogg' },
        'fr',
      ),
    ).resolves.toBe('salam');
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'audio/ogg', originalname: 'whatsapp-voice.ogg' }),
      'fr',
    );
  });

  it('returns a plan message when transcription quota is unavailable', async () => {
    reserveAudioTranscription.mockResolvedValue(false);
    sendText.mockResolvedValue({ messageId: 'message-1' });

    await expect(
      service.transcribeIncoming('session-1', '212600000000@c.us', { data: 'YXVkaW8=' }),
    ).resolves.toBeUndefined();
    expect(transcribe).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith('session-1', expect.objectContaining({ chatId: '212600000000@c.us' }));
  });

  it('returns audio only inside a voice-reply context and preserves its real media format', async () => {
    reserveAudioReply.mockResolvedValue(true);
    synthesize.mockResolvedValue({ data: Buffer.from('speech'), contentType: 'audio/mpeg', model: 'tts-model' });
    sendAudio.mockResolvedValue({ messageId: 'audio-1' });

    await service.withAudioReply('212600000000@c.us', () =>
      service.sendReply('session-1', { chatId: '212600000000@c.us', text: 'Bonjour' }),
    );

    expect(sendAudio).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ filename: 'assistant-reply.mp3', mimetype: 'audio/mpeg', ptt: false }),
    );
  });
});
