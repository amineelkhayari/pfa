import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, KeyRound, MessageCircleMore, Timer } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminAiApi } from '../services/api';
import './Account.css';

export function AiSettings() {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'ai-settings'], queryFn: adminAiApi.get });
  const [form, setForm] = useState({ enabled: false, provider: 'openai' as 'openai' | 'openrouter' | 'gemini' | 'custom', baseUrl: '', apiKey: '', model: 'gpt-5.4-nano', maxTurns: 8, conversationTimeoutHours: 24 });
  useEffect(() => { if (data) setForm(current => ({ ...current, enabled: data.enabled, provider: data.provider, baseUrl: data.baseUrl, model: data.model, maxTurns: data.maxTurns, conversationTimeoutHours: data.conversationTimeoutHours })); }, [data]);
  const save = useMutation({ mutationFn: () => adminAiApi.update(form), onSuccess: () => { setForm(current => ({ ...current, apiKey: '' })); void client.invalidateQueries({ queryKey: ['admin', 'ai-settings'] }); } });
  return <div className="account-page payment-settings-page"><PageHeader title="AI order confirmation" subtitle="Configure the assistant dynamically without restarting the application" />
    <div className="payment-overview"><div><Bot size={20}/><span><strong>{data?.enabled ? 'AI enabled' : 'AI disabled'}</strong><small>Order confirmation assistant</small></span></div><div><KeyRound size={20}/><span><strong>{data?.apiKeyConfigured ? 'API key configured' : 'API key missing'}</strong><small>Encrypted in the database</small></span></div><div><MessageCircleMore size={20}/><span><strong>{data?.maxTurns ?? 8} turns</strong><small>Before human handoff</small></span></div></div>
    <form className="account-card payment-panel ai-settings-panel" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      {isLoading ? <p>Loading AI settings…</p> : <>
        <div className="payment-panel-title"><Bot/><div><h2>Assistant configuration</h2><p>Changes are applied immediately to new WhatsApp replies.</p></div></div>
        <label className="provider-toggle"><span><strong>Enable AI confirmation</strong><small>Natural conversation for pending Shopify orders</small></span><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })}/></label>
        <label className="payment-field"><span>AI provider</span><select value={form.provider} onChange={event => { const provider = event.target.value as typeof form.provider; const defaults = { openai: 'gpt-5.4-nano', openrouter: 'openai/gpt-4o-mini', gemini: 'gemini-2.5-flash', custom: '' }; setForm({ ...form, provider, model: defaults[provider], baseUrl: '' }); }}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="gemini">Google Gemini</option><option value="custom">Other OpenAI-compatible provider</option></select><small>Each provider uses its correct API protocol.</small></label>
        <label className="payment-field"><span>Provider API key</span><input type="password" value={form.apiKey} placeholder={data?.apiKeyConfigured ? 'Configured — leave blank to keep current key' : 'Enter provider API key'} onChange={event => setForm({ ...form, apiKey: event.target.value })}/><small>The key is encrypted before database storage and is never returned to the browser.</small></label>
        <label className="payment-field"><span>Model</span><input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })}/><small>Use the exact model identifier available from the selected provider.</small></label>
        <label className="payment-field"><span>{form.provider === 'custom' ? 'Chat Completions endpoint URL' : 'Custom endpoint (optional)'}</span><input value={form.baseUrl} placeholder={form.provider === 'custom' ? 'https://provider.example/v1/chat/completions' : 'Leave blank to use the provider default'} onChange={event => setForm({ ...form, baseUrl: event.target.value })}/><small>{form.provider === 'gemini' ? 'Gemini base URL, without /models/model:generateContent.' : 'Only change this for a proxy or compatible gateway.'}</small></label>
        <div className="ai-number-grid"><label className="payment-field"><span>Maximum conversation turns</span><input type="number" min="2" max="50" value={form.maxTurns} onChange={event => setForm({ ...form, maxTurns: Number(event.target.value) })}/><small>After this limit, the conversation moves to a human.</small></label><label className="payment-field"><span><Timer size={14}/> Timeout in hours</span><input type="number" min="1" max="720" value={form.conversationTimeoutHours} onChange={event => setForm({ ...form, conversationTimeoutHours: Number(event.target.value) })}/><small>Inactive conversations expire and require human handling.</small></label></div>
      </>}
      <div className="payment-save"><button className="account-primary" disabled={isLoading || save.isPending}>{save.isPending ? 'Saving…' : 'Save AI settings'}</button>{save.isSuccess && <span className="account-success">AI settings applied.</span>}{save.isError && <span className="billing-error">{save.error.message}</span>}</div>
    </form>
  </div>;
}
