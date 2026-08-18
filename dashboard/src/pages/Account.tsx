import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { accountApi, billingApi } from '../services/api';
import './Account.css';

export function Account() {
  const client = useQueryClient();
  const isUserLogin = sessionStorage.getItem('openwa_api_key')?.startsWith('owa_usr_') ?? false;
  const { data: user, isLoading } = useQuery({ queryKey: ['account', 'me'], queryFn: accountApi.me, enabled: isUserLogin });
  const { data: subscriptions = [] } = useQuery({ queryKey: ['billing', 'status'], queryFn: billingApi.status, enabled: isUserLogin });
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('fr');
  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setLanguage(typeof user.settings?.language === 'string' ? user.settings.language : 'fr');
  }, [user]);
  const save = useMutation({
    mutationFn: () => accountApi.update({ name, settings: { language } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['account'] }),
  });
  const checkout = useMutation({
    mutationFn: (provider: 'stripe' | 'paypal' | 'portal') => provider === 'stripe' ? billingApi.stripeCheckout() : provider === 'paypal' ? billingApi.paypalSubscription() : billingApi.stripePortal(),
    onSuccess: result => window.location.assign(result.url),
  });

  if (!isUserLogin) return <div className="account-page"><PageHeader title="Account" subtitle="This API-key session has no customer profile." /></div>;
  if (isLoading || !user) return <div className="account-page">Loading account…</div>;
  return <div className="account-page">
    <PageHeader title="My account" subtitle="Profile, preferences and subscription" />
    <div className="account-grid">
      <form className="account-card" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        <h2>Profile</h2>
        <label>Full name<input value={name} onChange={event => setName(event.target.value)} minLength={2} required /></label>
        <label>Email<input value={user.email} disabled /></label>
        <label>Username<input value={user.username} disabled /></label>
        <label>Language<select value={language} onChange={event => setLanguage(event.target.value)}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select></label>
        <button className="account-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save profile'}</button>
        {save.isSuccess && <span className="account-success">Profile saved.</span>}
      </form>
      <div className="account-card subscription-card">
        <h2>Subscription</h2><span className={`plan-pill ${user.plan}`}>{user.plan}</span>
        <strong>{user.plan === 'pro' ? '$5 / month' : '$0 / month'}</strong>
        <p>{user.plan === 'pro' ? '5 sessions, 5 stores, 1,250 sent and received messages.' : '2 sessions, 2 stores, 500 sent and received messages.'}</p>
        {user.plan === 'free' ? <div className="billing-actions">
          <button className="account-primary" onClick={() => checkout.mutate('stripe')} disabled={checkout.isPending}>Pay with Stripe</button>
          <button className="account-secondary" onClick={() => checkout.mutate('paypal')} disabled={checkout.isPending}>Pay with PayPal</button>
        </div> : <button className="account-secondary" onClick={() => checkout.mutate('portal')} disabled={checkout.isPending}>Manage Stripe billing</button>}
        {checkout.isError && <small className="billing-error">{checkout.error.message}</small>}
        {subscriptions.map(subscription => <small key={subscription.id}><strong>{subscription.provider}</strong>: {subscription.status}{subscription.currentPeriodEnd ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ''}</small>)}
      </div>
    </div>
  </div>;
}
