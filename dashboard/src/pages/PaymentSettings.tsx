import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Globe2, ShieldCheck, WalletCards } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminBillingApi } from '../services/api';
import './Account.css';

type PaymentTab = 'general' | 'stripe' | 'paypal';

export function PaymentSettings() {
  const client = useQueryClient();
  const [tab, setTab] = useState<PaymentTab>('general');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'billing-settings'], queryFn: adminBillingApi.get });
  const [form, setForm] = useState<Record<string, any>>({ stripeEnabled: false, paypalEnabled: false, paypalEnvironment: 'sandbox' });
  useEffect(() => { if (data) setForm(current => ({ ...current, publicAppUrl: data.publicAppUrl ?? '', stripeEnabled: data.stripeEnabled, paypalEnabled: data.paypalEnabled, paypalEnvironment: data.paypalEnvironment })); }, [data]);
  const save = useMutation({ mutationFn: () => adminBillingApi.update(form), onSuccess: () => void client.invalidateQueries({ queryKey: ['admin', 'billing-settings'] }) });
  const field = (key: string, label: string, hint: string, secret = false) => <label className="payment-field"><span>{label}</span><input type={secret ? 'password' : 'text'} value={form[key] ?? ''} placeholder={secret && data?.configured[key] ? 'Configured — leave blank to keep current value' : ''} onChange={event => setForm({ ...form, [key]: event.target.value })}/><small>{hint}</small></label>;
  const configuredCount = data ? Object.values(data.configured).filter(Boolean).length : 0;
  return <div className="account-page payment-settings-page">
    <PageHeader title="Payment settings" subtitle="Manage provider credentials, subscriptions, and checkout configuration" />
    <div className="payment-overview"><div><ShieldCheck size={20}/><span><strong>Encrypted storage</strong><small>Secrets are protected at rest</small></span></div><div><CheckCircle2 size={20}/><span><strong>{configuredCount} credentials</strong><small>Currently configured</small></span></div><div><CreditCard size={20}/><span><strong>$5 / month</strong><small>Pro subscription price</small></span></div></div>
    <div className="payment-layout">
      <nav className="payment-tabs"><button type="button" className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><Globe2 size={18}/><span>General<small>Public checkout URL</small></span></button><button type="button" className={tab === 'stripe' ? 'active' : ''} onClick={() => setTab('stripe')}><CreditCard size={18}/><span>Stripe<small>{data?.stripeEnabled ? 'Enabled' : 'Disabled'}</small></span></button><button type="button" className={tab === 'paypal' ? 'active' : ''} onClick={() => setTab('paypal')}><WalletCards size={18}/><span>PayPal<small>{data?.paypalEnabled ? 'Enabled' : 'Disabled'}</small></span></button></nav>
      <form className="account-card payment-panel" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        {isLoading ? <p>Loading payment settings…</p> : <>
          {tab === 'general' && <><div className="payment-panel-title"><Globe2/><div><h2>General configuration</h2><p>Used for checkout success, cancellation, and billing portal redirects.</p></div></div>{field('publicAppUrl', 'Public dashboard URL', 'Example: https://app.yourdomain.com')}</>}
          {tab === 'stripe' && <><div className="payment-panel-title"><CreditCard/><div><h2>Stripe</h2><p>Recurring Pro subscriptions through Stripe Checkout.</p></div></div><label className="provider-toggle"><span><strong>Enable Stripe payments</strong><small>Allow customers to subscribe using Stripe</small></span><input type="checkbox" checked={Boolean(form.stripeEnabled)} onChange={event => setForm({ ...form, stripeEnabled: event.target.checked })}/></label>{field('stripeSecretKey', 'Secret key', 'Starts with sk_test_ or sk_live_', true)}{field('stripePriceId', 'Pro monthly Price ID', 'The recurring $5/month Stripe Price identifier')}{field('stripeWebhookSecret', 'Webhook signing secret', 'Used to verify incoming Stripe events', true)}</>}
          {tab === 'paypal' && <><div className="payment-panel-title"><WalletCards/><div><h2>PayPal</h2><p>Recurring Pro subscriptions through PayPal Billing.</p></div></div><label className="provider-toggle"><span><strong>Enable PayPal payments</strong><small>Allow customers to subscribe using PayPal</small></span><input type="checkbox" checked={Boolean(form.paypalEnabled)} onChange={event => setForm({ ...form, paypalEnabled: event.target.checked })}/></label><label className="payment-field"><span>Environment</span><select value={form.paypalEnvironment} onChange={event => setForm({ ...form, paypalEnvironment: event.target.value })}><option value="sandbox">Sandbox — testing</option><option value="live">Live — real payments</option></select><small>Use sandbox until your payment flow is fully tested.</small></label>{field('paypalClientId', 'Client ID', 'PayPal REST application client identifier', true)}{field('paypalClientSecret', 'Client secret', 'PayPal REST application secret', true)}{field('paypalPlanId', 'Pro monthly Plan ID', 'The recurring $5/month PayPal plan identifier')}{field('paypalWebhookId', 'Webhook ID', 'Used to verify incoming PayPal events', true)}</>}
        </>}
        <div className="payment-save"><button className="account-primary" disabled={save.isPending || isLoading}>{save.isPending ? 'Saving…' : 'Save settings'}</button>{save.isSuccess && <span className="account-success">Settings saved securely.</span>}{save.isError && <span className="billing-error">{save.error.message}</span>}</div>
      </form>
    </div>
  </div>;
}
