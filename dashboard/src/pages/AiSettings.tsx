import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  MessageSquare,
  Sparkles,
  Cpu,
  Mic,
  Volume2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Zap,
  Check,
  Play,
  Square,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminAiApi, aiTestApi } from '../services/api';
import { useToast } from '../hooks/useToast';
import './AiSettings.css';

type AiProvider = 'openai' | 'openrouter' | 'gemini' | 'custom';

const PROVIDER_INFO: Record<
  AiProvider,
  {
    name: string;
    description: string;
    defaultModel: string;
    presets: string[];
    placeholderKey: string;
    defaultBaseUrl?: string;
  }
> = {
  openrouter: {
    name: 'OpenRouter',
    description: 'DeepSeek, Llama 3, Claude & Free models',
    defaultModel: 'openai/gpt-4o-mini',
    presets: [
      'openai/gpt-4o-mini',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
    ],
    placeholderKey: 'sk-or-v1-...',
  },
  openai: {
    name: 'OpenAI',
    description: 'Official GPT-4o & GPT-4o-mini',
    defaultModel: 'gpt-4o-mini',
    presets: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    placeholderKey: 'sk-...',
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Gemini 2.5 Flash & Gemini 1.5 Pro',
    defaultModel: 'gemini-2.5-flash',
    presets: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    placeholderKey: 'AIzaSy...',
  },
  custom: {
    name: 'Custom Gateway',
    description: 'OmniRoute, vLLM, or self-hosted proxy',
    defaultModel: 'openrouter/free',
    presets: ['openrouter/free', 'meta-llama/llama-3.1-8b', 'mistralai/mistral-7b-instruct'],
    placeholderKey: 'Bearer token or gateway key',
    defaultBaseUrl: 'https://omniroute-production-5404.up.railway.app/api/v1/chat/completions',
  },
};

export function AiSettings() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [playingVoice, setPlayingVoice] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ai-settings'],
    queryFn: adminAiApi.get,
  });

  const [form, setForm] = useState({
    enabled: false,
    provider: 'openrouter' as AiProvider,
    baseUrl: '',
    apiKey: '',
    model: 'openai/gpt-4o-mini',
    maxTurns: 8,
    conversationTimeoutHours: 24,
    audioSttModel: 'deepgram/nova-3',
    audioSttLanguage: 'ar-MA',
    audioTtsModel: 'deepgram/aura-2-agathe-fr',
    audioVoice: 'hector',
    audioOutputFormat: 'mp3',
  });

  useEffect(() => {
    if (data) {
      setForm(current => ({
        ...current,
        enabled: data.enabled,
        provider: data.provider,
        baseUrl: data.baseUrl ?? '',
        model: data.model ?? '',
        maxTurns: data.maxTurns ?? 8,
        conversationTimeoutHours: data.conversationTimeoutHours ?? 24,
        audioSttModel: data.audio?.sttModel ?? 'deepgram/nova-3',
        audioSttLanguage: data.audio?.sttLanguage ?? 'ar-MA',
        audioTtsModel: data.audio?.ttsModel ?? 'deepgram/aura-2-agathe-fr',
        audioVoice: data.audio?.voiceId ?? '',
        audioOutputFormat: data.audio?.outputFormat ?? 'mp3',
      }));
    }
  }, [data]);

  // Clean model input of common copy-paste errors (double spaces, leading/trailing whitespace)
  const sanitizeModel = (raw: string) => raw.trim().replace(/\s+/g, ' ');

  // Save Mutation
  const save = useMutation({
    mutationFn: () =>
      adminAiApi.update({
        ...form,
        model: sanitizeModel(form.model),
      }),
    onSuccess: () => {
      setForm(current => ({ ...current, apiKey: '', model: sanitizeModel(current.model) }));
      void client.invalidateQueries({ queryKey: ['admin', 'ai-settings'] });
      toast.success('AI Order Confirmation settings updated successfully.');
    },
    onError: err => {
      toast.error('Failed to save settings', err instanceof Error ? err.message : undefined);
    },
  });

  // Switch Provider Handler
  const handleSelectProvider = (provider: AiProvider) => {
    const info = PROVIDER_INFO[provider];
    setForm(prev => ({
      ...prev,
      provider,
      model: info.defaultModel,
      baseUrl: provider === 'custom' ? info.defaultBaseUrl || prev.baseUrl : '',
    }));
    setTestResult(null);
  };

  // Test Connection / Ping Handler
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const ping = await aiTestApi.chat(
        'Ping test. Reply with exactly the words: "AI Connection OK".',
        [],
      );
      setTestResult({
        ok: true,
        message: `Connected! Provider: ${ping.provider} · Model: ${ping.model}`,
      });
      toast.success('AI Connection Verified', `Response received from ${ping.model}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown connection error';
      setTestResult({
        ok: false,
        message: errMsg,
      });
      toast.error('AI Connection Test Failed', errMsg);
    } finally {
      setTestingConnection(false);
    }
  };

  // Test Voice Synthesis
  const handleTestVoice = async () => {
    if (playingVoice) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingVoice(false);
      return;
    }

    setPlayingVoice(true);
    try {
      const sampleText =
        form.audioSttLanguage === 'ar-MA'
          ? 'Salam ! La commande dyalkom t-akdat b-najah.'
          : 'Bonjour ! Votre commande a été confirmée avec succès.';
      const blob = await aiTestApi.speech(sampleText);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingVoice(false);
        toast.error('Audio playback error', 'Could not play synthesized audio sample.');
      };
      await audio.play();
    } catch (err) {
      setPlayingVoice(false);
      toast.error('Voice synthesis failed', err instanceof Error ? err.message : undefined);
    }
  };

  const currentProviderInfo = PROVIDER_INFO[form.provider] || PROVIDER_INFO.openrouter;

  return (
    <div className="ai-settings-page">
      <PageHeader
        title="AI Order Confirmation & Voice Settings"
        subtitle="Manage natural WhatsApp conversation models, human handoff thresholds, and OmniRoute voice synthesis"
      />

      {/* Top Status & KPI Cards */}
      <section className="ai-status-grid">
        <div className="ai-status-card">
          <div className="ai-status-info">
            <span className="ai-status-eyebrow">Assistant Status</span>
            <span className="ai-status-value">
              {form.enabled ? 'Active' : 'Paused'}
            </span>
            <span className="ai-status-detail">
              {form.enabled
                ? 'Processing pending orders on WhatsApp'
                : 'Auto-confirmation is currently disabled'}
            </span>
          </div>
          <div className={`ai-status-icon ${form.enabled ? 'green' : 'amber'}`}>
            <Bot size={22} />
          </div>
        </div>

        <div className="ai-status-card">
          <div className="ai-status-info">
            <span className="ai-status-eyebrow">LLM Intelligence</span>
            <span className="ai-status-value">{currentProviderInfo.name}</span>
            <span className="ai-status-detail" title={form.model}>
              {form.model ? form.model.slice(0, 24) + (form.model.length > 24 ? '…' : '') : 'No model set'}
            </span>
          </div>
          <div className="ai-status-icon purple">
            <Sparkles size={22} />
          </div>
        </div>

        <div className="ai-status-card">
          <div className="ai-status-info">
            <span className="ai-status-eyebrow">Safety Guardrails</span>
            <span className="ai-status-value">{form.maxTurns} Turns</span>
            <span className="ai-status-detail">
              Auto-handoff to human agent after {form.maxTurns} replies
            </span>
          </div>
          <div className="ai-status-icon blue">
            <ShieldCheck size={22} />
          </div>
        </div>

        <div className="ai-status-card">
          <div className="ai-status-info">
            <span className="ai-status-eyebrow">Voice Language</span>
            <span className="ai-status-value">
              {form.audioSttLanguage === 'ar-MA' ? 'Moroccan Darija' : form.audioSttLanguage.toUpperCase()}
            </span>
            <span className="ai-status-detail">
              OmniRoute STT · {form.audioOutputFormat.toUpperCase()}
            </span>
          </div>
          <div className="ai-status-icon green">
            <Mic size={22} />
          </div>
        </div>
      </section>

      {/* Master Toggle Banner */}
      <div className={`ai-master-toggle-banner ${form.enabled ? 'active' : ''}`}>
        <div className="ai-master-toggle-content">
          <div className="ai-master-icon-badge">
            <Bot size={24} />
          </div>
          <div className="ai-master-toggle-text">
            <h2>
              Enable WhatsApp AI Confirmation Assistant
              {form.enabled ? (
                <span className="status-pill active" style={{ fontSize: '0.75rem' }}>
                  Live & Monitoring
                </span>
              ) : (
                <span className="status-pill failed" style={{ fontSize: '0.75rem' }}>
                  Disabled
                </span>
              )}
            </h2>
            <p>
              When active, the assistant engages customers on WhatsApp to confirm addresses, handle upsells, and answer questions.
            </p>
          </div>
        </div>

        <label className="switch-control" title="Toggle AI order confirmation">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={e => setForm({ ...form, enabled: e.target.checked })}
          />
          <span className="switch-slider" />
        </label>
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="ai-cards-layout">
          {/* CARD 1: Core LLM Engine & Provider */}
          <div className="ai-card">
            <div className="ai-card-header">
              <div className="ai-card-header-left">
                <div className="ai-card-icon purple">
                  <Cpu size={20} />
                </div>
                <div>
                  <h3>LLM Engine & Provider</h3>
                  <p>Choose the model provider for processing customer messages</p>
                </div>
              </div>
              <span className="status-pill succeeded">
                {data?.apiKeyConfigured ? 'Key Secured' : 'Key Needed'}
              </span>
            </div>

            {/* Provider Picker Buttons */}
            <div className="provider-picker-grid">
              {(['openrouter', 'openai', 'gemini', 'custom'] as AiProvider[]).map(pKey => {
                const p = PROVIDER_INFO[pKey];
                const isSelected = form.provider === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    className={`provider-picker-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectProvider(pKey)}
                  >
                    <span className="provider-btn-title">{p.name}</span>
                    <span className="provider-btn-desc">{p.description}</span>
                  </button>
                );
              })}
            </div>

            {/* API Key Field */}
            <div className="ai-form-group">
              <label>
                <span>Provider API Key</span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                  }}
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </label>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                placeholder={
                  data?.apiKeyConfigured
                    ? 'Encrypted key stored — leave empty to keep existing key'
                    : currentProviderInfo.placeholderKey
                }
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
              />
              <small>
                Keys are encrypted with AES-256 before database storage and never sent back to the browser.
              </small>
            </div>

            {/* Model Name Field & Presets */}
            <div className="ai-form-group">
              <label>
                <span>Model Identifier</span>
              </label>
              <input
                type="text"
                value={form.model}
                placeholder={currentProviderInfo.defaultModel}
                onChange={e => setForm({ ...form, model: e.target.value })}
              />
              <div className="model-presets-row">
                <span className="model-presets-label">Popular Presets:</span>
                {currentProviderInfo.presets.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className={`model-preset-chip ${form.model.trim() === preset ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, model: preset })}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Endpoint URL Field */}
            <div className="ai-form-group">
              <label>
                <span>
                  {form.provider === 'custom'
                    ? 'Chat Completions Endpoint URL'
                    : 'Custom Base URL / Proxy (Optional)'}
                </span>
              </label>
              <input
                type="url"
                value={form.baseUrl}
                placeholder={
                  form.provider === 'custom'
                    ? 'https://omniroute-production-5404.up.railway.app/api/v1/chat/completions'
                    : 'Leave blank to use provider default URL'
                }
                onChange={e => setForm({ ...form, baseUrl: e.target.value })}
              />
              <small>
                {form.provider === 'gemini'
                  ? 'Gemini base URL (without /models/...:generateContent).'
                  : form.provider === 'custom'
                    ? 'Full OpenAI-compatible chat completions URL including /v1/chat/completions.'
                    : 'Override this only if routing traffic through a local proxy or cloud gateway.'}
              </small>
            </div>

            {/* Live Test Connection Ping */}
            <div className="ai-test-connection-bar">
              <button
                type="button"
                className="btn-test-ping"
                disabled={testingConnection || isLoading}
                onClick={handleTestConnection}
              >
                {testingConnection ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Zap size={15} style={{ color: 'var(--warning)' }} />
                )}
                {testingConnection ? 'Pinging Model…' : 'Test AI Connection'}
              </button>

              {testResult && (
                <span className={`test-ping-result ${testResult.ok ? 'success' : 'error'}`}>
                  {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {testResult.message}
                </span>
              )}
              {!testResult && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Sends a test prompt through the backend to verify model responsiveness.
                </span>
              )}
            </div>
          </div>

          {/* CARD 2: Conversation Guardrails & Human Handoff */}
          <div className="ai-card">
            <div className="ai-card-header">
              <div className="ai-card-header-left">
                <div className="ai-card-icon blue">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3>Conversation Guardrails & Handoff</h3>
                  <p>Thresholds for escalating conversations to human agents</p>
                </div>
              </div>
            </div>

            <div className="ai-fields-2col">
              <div className="ai-form-group">
                <label>
                  <span>Max Conversation Turns</span>
                </label>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={form.maxTurns}
                  onChange={e => setForm({ ...form, maxTurns: Number(e.target.value) })}
                />
                <small>
                  After reaching this number of replies, the bot automatically pauses and notifies human agents.
                </small>
              </div>

              <div className="ai-form-group">
                <label>
                  <span>Inactivity Timeout (Hours)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={form.conversationTimeoutHours}
                  onChange={e =>
                    setForm({ ...form, conversationTimeoutHours: Number(e.target.value) })
                  }
                />
                <small>
                  Inactive conversations expire and cancel pending reservation holds.
                </small>
              </div>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '10px',
                background: 'var(--bg-light)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                🛡️ Built-in Safety & Handoff Rules
              </strong>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '1.2rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <li>
                  <strong>Human Request:</strong> When customers say "agent", "human", or express confusion, AI triggers human handoff immediately.
                </li>
                <li>
                  <strong>Stock Validation:</strong> Orders with out-of-stock items will never be auto-confirmed without operator verification.
                </li>
                <li>
                  <strong>Strict Boundaries:</strong> The bot only discusses the customer’s pending order, delivery timing, address, and related products.
                </li>
              </ul>
            </div>
          </div>

          {/* CARD 3: Voice & Audio Intelligence (OmniRoute Voice Hub) */}
          <div className="ai-card full-width">
            <div className="ai-card-header">
              <div className="ai-card-header-left">
                <div className="ai-card-icon green">
                  <Radio size={20} />
                </div>
                <div>
                  <h3>OmniRoute Voice & Audio Processing</h3>
                  <p>Speech-to-text voice note transcription and text-to-speech voice replies</p>
                </div>
              </div>
              <span className="morocco-highlight-badge">
                🇲🇦 Darija & French Optimized
              </span>
            </div>

            <div className="ai-fields-2col">
              <div className="ai-form-group">
                <label>
                  <span>Speech-to-Text (STT) Model</span>
                </label>
                <input
                  type="text"
                  value={form.audioSttModel}
                  placeholder="deepgram/nova-3"
                  onChange={e => setForm({ ...form, audioSttModel: e.target.value })}
                />
                <small>Recommended: <code>deepgram/nova-3</code> or <code>whisper-1</code></small>
              </div>

              <div className="ai-form-group">
                <label>
                  <span>Transcription Language</span>
                </label>
                <select
                  value={form.audioSttLanguage}
                  onChange={e => setForm({ ...form, audioSttLanguage: e.target.value })}
                >
                  <option value="ar-MA">Moroccan Arabic / Darija (ar-MA) ⭐ Recommended</option>
                  <option value="fr">French (fr)</option>
                  <option value="multi">Multilingual (multi)</option>
                  <option value="auto">Automatic Detection (auto)</option>
                  <option value="ar">Standard Arabic (ar)</option>
                  <option value="en">English (en)</option>
                </select>
                <small>
                  Select <strong>ar-MA</strong> for Moroccan WhatsApp voice notes. Avoid automatic detection on short voice notes.
                </small>
              </div>

              <div className="ai-form-group">
                <label>
                  <span>Text-to-Speech (TTS) Model</span>
                </label>
                <input
                  type="text"
                  value={form.audioTtsModel}
                  placeholder="deepgram/aura-2-agathe-fr"
                  onChange={e => setForm({ ...form, audioTtsModel: e.target.value })}
                />
                <small>OmniRoute speech synthesis model identifier</small>
              </div>

              <div className="ai-form-group">
                <label>
                  <span>Voice ID</span>
                </label>
                <input
                  type="text"
                  value={form.audioVoice}
                  placeholder="e.g. hector, agathe, or elevenlabs voice ID"
                  onChange={e => setForm({ ...form, audioVoice: e.target.value })}
                />
                <small>Specific voice timbre passed to the selected TTS model</small>
              </div>

              <div className="ai-form-group">
                <label>
                  <span>Audio Output Format</span>
                </label>
                <select
                  value={form.audioOutputFormat}
                  onChange={e => setForm({ ...form, audioOutputFormat: e.target.value })}
                >
                  <option value="mp3">MP3 (Universal WhatsApp & Browser Compatibility)</option>
                  <option value="opus">Opus (WhatsApp Voice Note format)</option>
                  <option value="wav">WAV (Uncompressed)</option>
                </select>
                <small>MP3 is strongly recommended for WhatsApp voice messaging.</small>
              </div>

              {/* Quick Voice Audio Preview */}
              <div className="ai-form-group" style={{ justifyContent: 'center' }}>
                <label>
                  <span>Audio Synthesis Preview</span>
                </label>
                <div className="voice-test-row">
                  <span className="voice-test-text">
                    <Volume2 size={16} /> Test confirmation sample in selected language
                  </span>
                  <button
                    type="button"
                    className="btn-play-voice"
                    onClick={handleTestVoice}
                  >
                    {playingVoice ? <Square size={14} /> : <Play size={14} />}
                    {playingVoice ? 'Stop Audio' : 'Play Sample'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="ai-save-footer">
          <div className="ai-footer-left">
            <button
              type="button"
              className="btn-live-simulator"
              onClick={() => navigate('/ai-test')}
              title="Open full interactive simulator with order context"
            >
              <MessageSquare size={16} />
              Open Live AI Test Chat
              <ExternalLink size={14} />
            </button>
          </div>

          <button
            type="submit"
            className="ai-save-button"
            disabled={save.isPending || isLoading}
          >
            {save.isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Check size={18} />
            )}
            {save.isPending ? 'Saving AI Settings…' : 'Save AI Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
