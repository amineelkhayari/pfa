import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Megaphone,
  Send,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { campaignApi, sessionApi, templateApi } from '../services/api';
import { useToast } from '../hooks/useToast';
import { PlanUpgradeNotice, usePlanLimit } from '../components/PlanLimitGate';
import './Campaigns.css';

export function Campaigns() {
  const qc = useQueryClient(),
    toast = useToast();
  const messageLimit = usePlanLimit('sentMessages');
  const report = useQuery({ queryKey: ['campaign-report'], queryFn: campaignApi.report, refetchInterval: 5000 });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: sessionApi.list });
  const [form, setForm] = useState({ name: '', message: '', sessionId: '', delayBetweenMessages: 4000 });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [templateId, setTemplateId] = useState('');
  const audience = useQuery({
    queryKey: ['campaign-audience', form.sessionId],
    queryFn: () => campaignApi.audience(form.sessionId),
    enabled: Boolean(form.sessionId),
  });
  const templates = useQuery({
    queryKey: ['campaign-templates', form.sessionId],
    queryFn: () => templateApi.list(form.sessionId),
    enabled: Boolean(form.sessionId),
  });
  const launch = useMutation({
    mutationFn: campaignApi.create,
    onSuccess: () => {
      toast.success('Campaign launched');
      setForm(f => ({ ...f, name: '', message: '' }));
      void qc.invalidateQueries({ queryKey: ['campaign-report'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: campaignApi.cancel,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaign-report'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const data = report.data;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (messageLimit.blocked) return;
    launch.mutate({ ...form, excludedRecipients: excluded });
  };
  const customers = audience.data?.customers ?? [];
  const visibleCustomers = customers.filter(customer =>
    `${customer.name} ${customer.phone} ${customer.stores.join(' ')}`
      .toLowerCase()
      .includes(customerSearch.toLowerCase()),
  );
  const selectedCount = customers.length - excluded.length;
  const toggleCustomer = (chatId: string) =>
    setExcluded(current => (current.includes(chatId) ? current.filter(id => id !== chatId) : [...current, chatId]));
  return (
    <div className="campaign-page">
      <header>
        <p className="eyebrow">CUSTOMER OUTREACH</p>
        <h1>Campaigns</h1>
        <p>Compose targeted messages, manage recipients, and review campaign records.</p>
      </header>
      {messageLimit.reason && <PlanUpgradeNotice reason={messageLimit.reason} />}
      {report.isLoading && <div className="campaign-panel">Loading campaigns…</div>}
      <section className="campaign-grid lower">
        <form className="campaign-panel compose" onSubmit={submit}>
          <div className="section-title">
            <div>
              <h2>Create campaign</h2>
              <p>Send one message to all unique customers of stores linked to this device.</p>
            </div>
            <Megaphone />
          </div>
          <label>
            Campaign name
            <input
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Summer customers"
            />
          </label>
          <label>
            WhatsApp device
            <select
              required
              value={form.sessionId}
              onChange={e => {
                setForm({ ...form, sessionId: e.target.value });
                setExcluded([]);
                setCustomerSearch('');
                setTemplateId('');
              }}
            >
              <option value="">Select connected device</option>
              {sessions.data
                ?.filter(s => s.status === 'ready')
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.phone ? ` · ${s.phone}` : ''}
                  </option>
                ))}
            </select>
          </label>
          {form.sessionId && (
            <div className="audience-picker">
              <div className="audience-heading">
                <div>
                  <b>Campaign recipients</b>
                  <small>
                    {audience.isLoading ? 'Loading customers…' : `${selectedCount} of ${customers.length} selected`}
                  </small>
                </div>
                <button type="button" onClick={() => setExcluded(excluded.length ? [] : customers.map(c => c.chatId))}>
                  {excluded.length ? 'Select all' : 'Exclude all'}
                </button>
              </div>
              <input
                aria-label="Search customers"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search name, phone or store…"
              />
              <div className="audience-list">
                {audience.isError && <p className="audience-error">{(audience.error as Error).message}</p>}
                {!audience.isLoading && !customers.length && <p>No customers with valid phone numbers.</p>}
                {visibleCustomers.map(customer => (
                  <label className="customer-option" key={customer.chatId}>
                    <input
                      type="checkbox"
                      checked={!excluded.includes(customer.chatId)}
                      onChange={() => toggleCustomer(customer.chatId)}
                    />
                    <span>
                      <b>{customer.name}</b>
                      <small>
                        {customer.phone} · {customer.stores.join(', ')}
                      </small>
                    </span>
                    <em>
                      {customer.orderCount} order{customer.orderCount === 1 ? '' : 's'}
                    </em>
                  </label>
                ))}
              </div>
              {!!audience.data?.invalidPhones && (
                <small>{audience.data.invalidPhones} order phone number(s) were invalid and will be skipped.</small>
              )}
            </div>
          )}
          <label>
            Message template
            <select
              value={templateId}
              onChange={e => {
                const id = e.target.value;
                setTemplateId(id);
                const template = templates.data?.find(item => item.id === id);
                if (template) {
                  setForm(current => ({
                    ...current,
                    message: [template.header, template.body, template.footer].filter(Boolean).join('\n\n'),
                  }));
                }
              }}
              disabled={!form.sessionId || templates.isLoading}
            >
              <option value="">Custom message</option>
              {templates.data?.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <small>
              {templates.isLoading
                ? 'Loading templates…'
                : templates.data?.length
                  ? 'Choose a template, then edit it below. Variables: {{customer}}, {{phone}}, {{store}}.'
                  : 'No templates for this session. Compose a custom message below.'}
            </small>
          </label>
          <label>
            Message
            <textarea
              required
              rows={6}
              maxLength={4000}
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              placeholder="Salam {{customer}}, discover our latest offer…"
            />
          </label>
          <label>
            Delay between messages
            <input
              type="number"
              min={1500}
              max={60000}
              value={form.delayBetweenMessages}
              onChange={e => setForm({ ...form, delayBetweenMessages: Number(e.target.value) })}
            />
            <small>4–8 seconds is safer for WhatsApp account health.</small>
          </label>
          <button
            className="launch"
            disabled={launch.isPending || !selectedCount || messageLimit.blocked}
            title={messageLimit.reason ?? undefined}
          >
            <Send size={17} />
            {launch.isPending ? 'Launching…' : `Launch to ${selectedCount} customer${selectedCount === 1 ? '' : 's'}`}
          </button>
        </form>
        <article className="campaign-panel history">
          <div className="section-title">
            <div>
              <h2>Campaign performance</h2>
              <p>Live delivery status refreshes automatically.</p>
            </div>
            <Activity />
          </div>
          {!data?.campaigns.length ? (
            <div className="empty">
              <Megaphone />
              <b>No campaigns yet</b>
              <span>Create your first customer campaign.</span>
            </div>
          ) : (
            data.campaigns.map(c => (
              <div className="campaign-row" key={c.id}>
                <div>
                  <b>{c.name}</b>
                  <span>
                    {new Date(c.createdAt).toLocaleString()} · risk {c.riskScore}/100
                  </span>
                </div>
                <div className="delivery">
                  <span className={`pill ${c.status}`}>{c.status}</span>
                  <small>
                    {c.sent} sent · {c.failed} failed · {c.pending} pending
                  </small>
                </div>
                {c.status === 'running' && (
                  <button onClick={() => cancel.mutate(c.id)}>
                    <XCircle size={16} /> Cancel
                  </button>
                )}
              </div>
            ))
          )}
        </article>
      </section>
      {data && (
        <section className="campaign-panel devices">
          <div className="section-title">
            <div>
              <h2>Connected accounts</h2>
              <p>WhatsApp devices connected with this user</p>
            </div>
            <b>{data.accountHealth.connected} connected</b>
          </div>
          {!data.devices.length ? (
            <div className="empty">No connected WhatsApp accounts found.</div>
          ) : (
            <div className="device-grid">
              {data.devices.map(d => (
                <article key={d.id}>
                  <Smartphone />
                  <div>
                    <b>{d.name}</b>
                    <span>{d.phone || 'Number unavailable'}</span>
                  </div>
                  <span className={`pill ${d.status === 'ready' ? 'completed' : 'failed'}`}>{d.status}</span>
                  <small>
                    {d.sent} sent · {d.received} received · {d.campaigns} campaigns
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
