import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { accountApi, billingApi } from '../services/api';
import './Account.css';

export function Account() {
  const client = useQueryClient();
  const isUserLogin = Boolean(sessionStorage.getItem('openwa_access_token'));
  const { data: user, isLoading } = useQuery({ queryKey: ['account', 'me'], queryFn: accountApi.me, enabled: isUserLogin });
  const { data: subscriptions = [] } = useQuery({ queryKey: ['billing', 'status'], queryFn: billingApi.status, enabled: isUserLogin });
  const { data: payments } = useQuery({ queryKey: ['billing', 'history'], queryFn: billingApi.history, enabled: isUserLogin });
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
  const subscriptionAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'reactivate' }) => action === 'cancel' ? billingApi.cancelSubscription(id, 'Cancelled from account settings') : billingApi.reactivateSubscription(id),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['billing'] }); void client.invalidateQueries({ queryKey: ['account'] }); },
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
        {subscriptions.map(subscription => <div className="subscription-row" key={subscription.id}><span><strong>{subscription.provider}</strong>: {subscription.status}{subscription.currentPeriodEnd ? ` · ${subscription.cancelAtPeriodEnd ? 'ends' : 'renews'} ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ''}</span><div>{subscription.cancelAtPeriodEnd ? <button className="subscription-link" disabled={subscriptionAction.isPending} onClick={() => subscriptionAction.mutate({ id: subscription.id, action: 'reactivate' })}>Keep subscription</button> : ['active', 'trialing'].includes(subscription.status.toLowerCase()) && <button className="subscription-link danger" disabled={subscriptionAction.isPending} onClick={() => { const warning = subscription.provider === 'paypal' ? 'PayPal cancellation is immediate and Pro access will end now. Continue?' : 'Automatic renewal will stop, but Pro access remains until the paid period ends. Continue?'; if (window.confirm(warning)) subscriptionAction.mutate({ id: subscription.id, action: 'cancel' }); }}>Cancel subscription</button>}</div></div>)}
        {subscriptionAction.isError && <small className="billing-error">{subscriptionAction.error.message}</small>}
      </div>
    </div>
    <section className="account-card payment-history-card">
      <div className="payment-history-heading"><div><h2>Payment history</h2><p>Your subscription charges and renewal attempts.</p></div><strong>{payments?.total ?? 0} payments</strong></div>
      <div className="payment-table-wrap"><table className="payment-table"><thead><tr><th>Date</th><th>Provider</th><th>Description</th><th>Status</th><th>Amount</th></tr></thead><tbody>
        {payments?.items.map(payment => <tr key={payment.id}><td>{new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString()}</td><td className="payment-provider">{payment.provider}</td><td>{payment.description ?? 'Pro subscription'}</td><td><span className={`payment-status ${payment.status}`}>{payment.status}</span></td><td>{new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency }).format(payment.amount / 100)}</td></tr>)}
        {!payments?.items.length && <tr><td colSpan={5} className="payment-empty">No payment recorded yet. Payments appear after a provider webhook is received.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
