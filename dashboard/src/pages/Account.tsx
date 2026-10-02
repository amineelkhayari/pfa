import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Users, CreditCard, LayoutDashboard, Server } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { accountApi, billingApi } from '../services/api';
import { PricingPlans } from '../components/PricingPlans';
import type { BillingPlan } from '../services/api';
import { formatBillingDate, subscriptionSchedule } from '../utils/subscriptionSchedule';
import { useRole } from '../hooks/useRole';
import './Account.css';

export function Account() {
  const client = useQueryClient();
  const { isAdmin } = useRole();
  const isUserLogin = Boolean(localStorage.getItem('smartConfirm_access_token'));
  const { data: user, isLoading } = useQuery({ queryKey: ['account', 'me'], queryFn: accountApi.me, enabled: isUserLogin });
  const isAdministrator = isAdmin || user?.role === 'admin';
  const { data: subscriptions = [] } = useQuery({ queryKey: ['billing', 'status'], queryFn: billingApi.status, enabled: isUserLogin && !isAdministrator });
  const { data: payments } = useQuery({ queryKey: ['billing', 'history'], queryFn: billingApi.history, enabled: isUserLogin && !isAdministrator });
  const { data: usage } = useQuery({ queryKey: ['account', 'usage'], queryFn: accountApi.usage, enabled: isUserLogin && !isAdministrator });
  const { data: plans = [] } = useQuery({ queryKey: ['billing', 'plans'], queryFn: billingApi.plans, enabled: isUserLogin && !isAdministrator });
  const { data: addons = [] } = useQuery({ queryKey: ['billing', 'addons'], queryFn: billingApi.addons, enabled: isUserLogin && !isAdministrator });
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('fr');

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setLanguage(typeof user.settings?.language === 'string' ? user.settings.language : 'fr');
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('addon') === 'success') {
      alert('Payment successful! Your extra quota has been added to your account.');
      window.history.replaceState({}, '', window.location.pathname);
      void client.invalidateQueries({ queryKey: ['account'] });
    }
  }, [client]);

  const save = useMutation({
    mutationFn: () => accountApi.update({ name, settings: { language } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['account'] }),
  });
  const checkout = useMutation({
    mutationFn: ({ provider, plan = 'pro' }: { provider: 'stripe' | 'paypal' | 'portal'; plan?: string }) =>
      provider === 'stripe' ? billingApi.stripeCheckout(plan) : provider === 'paypal' ? billingApi.paypalSubscription(plan) : billingApi.stripePortal(),
    onSuccess: (result) => window.location.assign(result.url),
  });
  const buyAddon = useMutation({
    mutationFn: (addonKey: string) => billingApi.purchaseAddon(addonKey, 1),
    onSuccess: (result) => {
      if (result.url) {
        window.location.assign(result.url);
      } else {
        alert(result.message || 'Extra quota added successfully to your account!');
        void client.invalidateQueries({ queryKey: ['account'] });
      }
    },
  });
  const subscriptionAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'reactivate' }) =>
      action === 'cancel' ? billingApi.cancelSubscription(id, 'Cancelled from account settings') : billingApi.reactivateSubscription(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['billing'] });
      void client.invalidateQueries({ queryKey: ['account'] });
    },
    onError: (err: any) => {
      void client.invalidateQueries({ queryKey: ['billing'] });
      void client.invalidateQueries({ queryKey: ['account'] });
      window.alert(err?.message || 'Subscription update failed.');
    },
  });
  const planChange = useMutation({
    mutationFn: async ({ subscriptionId, plan }: { subscriptionId: string; plan: BillingPlan }) => {
      const preview = await billingApi.previewPlanChange(subscriptionId, plan.slug);
      const amount =
        preview.amountDue == null
          ? 'calculated by the provider'
          : new Intl.NumberFormat(undefined, { style: 'currency', currency: preview.currency }).format(preview.amountDue / 100);
      const timing = preview.effectiveAt ? new Date(preview.effectiveAt).toLocaleString() : 'after provider confirmation';
      const accepted = window.confirm(
        `${preview.direction === 'upgrade' ? 'Upgrade' : 'Downgrade'} from ${preview.currentPlan} to ${preview.targetPlan}?\n\nAmount due now: ${amount}\nEffective: ${timing}\n\n${preview.note}`,
      );
      if (!accepted) return null;
      return billingApi.changePlan(subscriptionId, plan.slug, preview.prorationDate);
    },
    onSuccess: (result) => {
      if (!result) return;
      if (result.approvalUrl) window.location.assign(result.approvalUrl);
      else {
        void client.invalidateQueries({ queryKey: ['billing'] });
        void client.invalidateQueries({ queryKey: ['account'] });
      }
    },
  });
  const planRecovery = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'cancel' | 'reconcile' }) => {
      if (action === 'cancel') {
        const result = await billingApi.cancelPlanChange(id);
        return { subscription: result.subscription, messages: result.warning ? [result.warning] : [] };
      }
      const result = await billingApi.reconcileSubscription(id);
      return { subscription: result.subscription, messages: result.warnings };
    },
    onSuccess: (result) => {
      if (result.messages.length) window.alert(result.messages.join('\n'));
      void client.invalidateQueries({ queryKey: ['billing'] });
      void client.invalidateQueries({ queryKey: ['account'] });
    },
    onError: (err: any) => {
      void client.invalidateQueries({ queryKey: ['billing'] });
      void client.invalidateQueries({ queryKey: ['account'] });
      window.alert(err?.message || 'Unable to sync subscription status.');
    },
  });
  const refundRequestMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return billingApi.requestRefund(id, reason);
    },
    onSuccess: () => {
      window.alert('Refund request submitted successfully! An administrator will review your request.');
      void client.invalidateQueries({ queryKey: ['billing', 'history'] });
    },
    onError: (err: any) => {
      window.alert(err?.message || 'Failed to submit refund request.');
    },
  });
  const currentPlan = plans.find((plan) => plan.slug === user?.plan);
  const activeStripeSub = subscriptions.find(
    (s) => s.provider === 'stripe' && ['active', 'trialing'].includes(s.status.toLowerCase()),
  );
  const activePayPalSub = subscriptions.find(
    (s) => s.provider === 'paypal' && ['active', 'trialing'].includes(s.status.toLowerCase()),
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addonParam = params.get('addon');
    const sessionId = params.get('session_id');
    if (addonParam === 'success' && sessionId) {
      billingApi
        .claimAddon(sessionId)
        .then((res) => {
          window.alert(res.message || 'Quota added successfully!');
          void client.invalidateQueries({ queryKey: ['account'] });
          void client.invalidateQueries({ queryKey: ['billing'] });
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((err) => {
          console.error('Failed to claim addon session:', err);
          void client.invalidateQueries({ queryKey: ['account'] });
          void client.invalidateQueries({ queryKey: ['billing'] });
        });
    } else if (addonParam === 'success') {
      void client.invalidateQueries({ queryKey: ['account'] });
      void client.invalidateQueries({ queryKey: ['billing'] });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [client]);

  if (!isUserLogin) {
    return (
      <div className="account-page">
        <PageHeader title="Account" subtitle="This API-key session has no customer profile." />
      </div>
    );
  }
  if (isLoading || !user) return <div className="account-page">Loading account…</div>;

  return (
    <div className="account-page">
      <PageHeader
        title="My account"
        subtitle={isAdministrator ? 'Profile and platform administrator settings' : 'Profile, preferences and subscription'}
      />
      <div className="account-grid">
        <form
          className="account-card"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <h2>Profile</h2>
          <label>
            Full name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
          </label>
          <label>
            Email
            <input value={user.email} disabled />
          </label>
          <label>
            Username
            <input value={user.username} disabled />
          </label>
          <label>
            Language
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <button className="account-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </button>
          {save.isSuccess && <span className="account-success">Profile saved.</span>}
        </form>
        {isAdministrator ? (
          <div className="account-card admin-privilege-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '999px',
                }}
              >
                <ShieldCheck size={14} />
                Administrator
              </span>
              <small style={{ color: 'var(--text-secondary)' }}>Full System Privileges</small>
            </div>
            <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.25rem' }}>Unlimited Platform Access</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.55, margin: 0 }}>
              As a platform administrator, your account is exempt from plan limits and quotas. You have unrestricted access to all WhatsApp sessions, connected stores, messages, and AI automation. Plan subscriptions do not apply to administrator accounts.
            </p>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <strong style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Management Shortcuts
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <Link
                  to="/admin-dashboard"
                  className="account-primary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.82rem', padding: '0.6rem 0.75rem' }}
                >
                  <LayoutDashboard size={14} />
                  Dashboard
                </Link>
                <Link
                  to="/admin-users"
                  className="account-secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.82rem', padding: '0.6rem 0.75rem' }}
                >
                  <Users size={14} />
                  Users
                </Link>
                <Link
                  to="/payment-settings"
                  className="account-secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.82rem', padding: '0.6rem 0.75rem' }}
                >
                  <CreditCard size={14} />
                  Payments
                </Link>
                <Link
                  to="/infrastructure"
                  className="account-secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.82rem', padding: '0.6rem 0.75rem' }}
                >
                  <Server size={14} />
                  Infrastructure
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="account-card subscription-card">
          <h2>Subscription</h2>
          <span className={`plan-pill ${user.plan}`}>{user.plan}</span>
          <strong>
            {currentPlan
              ? `${new Intl.NumberFormat(undefined, { style: 'currency', currency: currentPlan.currency }).format(currentPlan.priceMonthly / 100)} / month`
              : user.plan}
          </strong>
          <p>
            {usage?.trialExpired
              ? 'Your one-time trial has expired. Choose a paid plan or contact support to continue.'
              : `${usage?.limits.sessions ?? 1} sessions, ${usage?.limits.stores ?? 1} stores, ${(usage?.limits.sentMessages ?? 0).toLocaleString()} sent messages and ${(usage?.limits.aiTokens ?? 0).toLocaleString()} AI context tokens.`}
          </p>
          {user.plan === 'free' && usage?.trialEndsAt && (
            <small className={usage.trialExpired ? 'billing-error' : ''}>
              {usage.trialExpired ? 'Expired' : 'Expires'}: {new Date(usage.trialEndsAt).toLocaleString()}
            </small>
          )}
          {usage?.extraQuota &&
            Boolean(
              usage.extraQuota.sessions ||
                usage.extraQuota.stores ||
                usage.extraQuota.sentMessages ||
                usage.extraQuota.receivedMessages ||
                usage.extraQuota.aiTokens,
            ) && (
              <div style={{ fontSize: '0.8rem', color: 'var(--primary)', background: 'rgba(37,211,102,0.1)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                <strong>Active Extra Quota: </strong>
                {[
                  usage.extraQuota.sessions ? `+${usage.extraQuota.sessions} Session(s)` : null,
                  usage.extraQuota.stores ? `+${usage.extraQuota.stores} Store(s)` : null,
                  usage.extraQuota.sentMessages ? `+${usage.extraQuota.sentMessages.toLocaleString()} Sent Msgs` : null,
                  usage.extraQuota.receivedMessages ? `+${usage.extraQuota.receivedMessages.toLocaleString()} Rcvd Msgs` : null,
                  usage.extraQuota.aiTokens ? `+${usage.extraQuota.aiTokens.toLocaleString()} AI Tokens` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          {user.plan === 'free' ? (
            <div className="billing-actions">
              <button className="account-primary" onClick={() => checkout.mutate({ provider: 'stripe' })} disabled={checkout.isPending}>
                Pay with Stripe
              </button>
              <button className="account-secondary" onClick={() => checkout.mutate({ provider: 'paypal' })} disabled={checkout.isPending}>
                Pay with PayPal
              </button>
            </div>
          ) : (
            <div className="billing-actions">
              {activeStripeSub && (
                <button className="account-secondary" onClick={() => checkout.mutate({ provider: 'portal' })} disabled={checkout.isPending}>
                  Manage Stripe billing
                </button>
              )}
              {activePayPalSub && (
                <a
                  className="account-secondary"
                  href="https://www.paypal.com/myaccount/autopay/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                >
                  Manage on PayPal ↗
                </a>
              )}
            </div>
          )}
          <a href="#addons" style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 650, textDecoration: 'none', marginTop: '0.25rem' }}>
            + Need more sessions or stores? Buy Extra Quota →
          </a>
          {checkout.isError && <small className="billing-error">{checkout.error.message}</small>}
          {subscriptions.map((subscription) => {
            const schedule = subscriptionSchedule(subscription);
            return (
              <div className="subscription-row subscription-schedule" key={subscription.id}>
                <span>
                  <strong>{subscription.provider.toUpperCase()}</strong>
                  <small className={`subscription-state ${subscription.status.toLowerCase()}`}>{subscription.status}</small>
                </span>
                <span className="subscription-date">
                  <small>{schedule.label}</small>
                  <strong>{formatBillingDate(schedule.date)}</strong>
                  <small>{schedule.autoRenew ? 'Automatic renewal enabled' : 'Automatic renewal disabled'}</small>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {subscription.cancelAtPeriodEnd ? (
                    <button
                      className="subscription-link"
                      disabled={subscriptionAction.isPending}
                      onClick={() => subscriptionAction.mutate({ id: subscription.id, action: 'reactivate' })}
                    >
                      Keep subscription
                    </button>
                  ) : (
                    ['active', 'trialing'].includes(subscription.status.toLowerCase()) && (
                      <button
                        className="subscription-link danger"
                        disabled={subscriptionAction.isPending}
                        onClick={() => {
                          const warning =
                            subscription.provider === 'paypal'
                              ? 'PayPal cancellation is immediate and Pro access will end now. Continue?'
                              : 'Automatic renewal will stop, but Pro access remains until the paid period ends. Continue?';
                          if (window.confirm(warning)) subscriptionAction.mutate({ id: subscription.id, action: 'cancel' });
                        }}
                      >
                        Cancel subscription
                      </button>
                    )
                  )}
                  <button
                    className="subscription-link"
                    disabled={planRecovery.isPending}
                    onClick={() => planRecovery.mutate({ id: subscription.id, action: 'reconcile' })}
                    title="Check payment provider for latest status"
                  >
                    {planRecovery.isPending ? 'Syncing…' : 'Sync status'}
                  </button>
                </div>
              </div>
            );
          })}
          {subscriptions.some((subscription) => ['pending_payment', 'pending_approval', 'scheduled'].includes(subscription.planChangeStatus)) && (
            <div className="plan-change-notice">
              {subscriptions
                .filter((subscription) => subscription.pendingPlanSlug)
                .map((subscription) => (
                  <div className="plan-change-row" key={subscription.id}>
                    <span>
                      <strong>Plan change: {subscription.pendingPlanSlug}</strong>
                      <small>
                        {subscription.planChangeStatus.replaceAll('_', ' ')}
                        {subscription.planChangeEffectiveAt ? ` · effective ${formatBillingDate(subscription.planChangeEffectiveAt)}` : ''}
                      </small>
                    </span>
                    <div>
                      <button
                        type="button"
                        className="subscription-link"
                        disabled={planRecovery.isPending}
                        onClick={() => planRecovery.mutate({ id: subscription.id, action: 'reconcile' })}
                      >
                        Sync status
                      </button>
                      {!(subscription.provider === 'stripe' && subscription.planChangeStatus === 'pending_payment') &&
                        !(subscription.provider === 'paypal' && subscription.planChangeStatus === 'scheduled') && (
                          <button
                            type="button"
                            className="subscription-link danger"
                            disabled={planRecovery.isPending}
                            onClick={() => window.confirm('Cancel this pending plan change?') && planRecovery.mutate({ id: subscription.id, action: 'cancel' })}
                          >
                            Cancel change
                          </button>
                        )}
                    </div>
                  </div>
                ))}
            </div>
          )}
          {subscriptions.some((subscription) => subscription.planChangeStatus === 'failed') && (
            <small className="billing-error">
              {subscriptions.find((subscription) => subscription.planChangeStatus === 'failed')?.planChangeError ?? 'The latest plan change failed.'}
            </small>
          )}
          {subscriptionAction.isError && <small className="billing-error">{subscriptionAction.error.message}</small>}
          {planRecovery.isError && <small className="billing-error">{planRecovery.error.message}</small>}
        </div>
        )}
      </div>

      {isAdministrator ? (
        <section className="account-card payment-history-card" style={{ maxWidth: '1000px', marginTop: '1.5rem' }}>
          <div className="payment-history-heading">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={20} style={{ color: 'var(--primary)' }} />
                <h2 style={{ margin: 0 }}>Platform Billing & Revenue</h2>
              </div>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                Configure payment gateways (Stripe & PayPal), customize subscription plans, monitor platform revenue, and manage customer refunds.
              </p>
            </div>
            <Link to="/payment-settings" className="account-primary" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Manage Payment Settings →
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="account-card addons-section" id="addons" style={{ maxWidth: '1000px', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2>Extra Quotas & Add-ons</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '0.25rem 0 0' }}>
                  Reached your plan limits? Add extra WhatsApp sessions, stores, or message packs without changing your base plan.
                </p>
              </div>
              {usage?.extraQuota && (
                <div
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '8px',
                    background: 'rgba(37,211,102,0.12)',
                    color: 'var(--primary)',
                    fontSize: '0.78rem',
                    fontWeight: 650,
                  }}
                >
                  Active Add-ons: {[
                    usage.extraQuota.sessions ? `+${usage.extraQuota.sessions} Session${usage.extraQuota.sessions > 1 ? 's' : ''}` : null,
                    usage.extraQuota.stores ? `+${usage.extraQuota.stores} Store${usage.extraQuota.stores > 1 ? 's' : ''}` : null,
                    usage.extraQuota.sentMessages ? `+${usage.extraQuota.sentMessages.toLocaleString()} Msgs` : null,
                    usage.extraQuota.aiTokens ? `+${usage.extraQuota.aiTokens.toLocaleString()} Tokens` : null,
                  ].filter(Boolean).join(' · ') || 'None active yet'}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.85rem' }}>
              {addons.map((addon) => (
                <div
                  key={addon.key}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    background: 'var(--bg-white)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{addon.title}</strong>
                    <span style={{ fontSize: '1.2rem', fontWeight: 750, color: 'var(--primary)' }}>
                      ${(addon.priceCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0, minHeight: '2.5rem', lineHeight: 1.4 }}>
                    {addon.description}
                  </p>
                  <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="account-primary"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.82rem' }}
                      disabled={buyAddon.isPending}
                      onClick={() => buyAddon.mutate(addon.key)}
                    >
                      {buyAddon.isPending ? 'Processing…' : `Buy ${addon.title}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {buyAddon.isError && <small className="billing-error">{buyAddon.error.message}</small>}
          </section>

          <PricingPlans
            plans={plans}
            currentPlan={user.plan}
            busy={checkout.isPending || planChange.isPending}
            onSelect={(plan: BillingPlan, provider) => {
              const active = subscriptions.find((subscription) => ['active', 'trialing'].includes(subscription.status.toLowerCase()));
              if (active) planChange.mutate({ subscriptionId: active.id, plan });
              else checkout.mutate({ provider, plan: plan.slug });
            }}
          />
          {planChange.isError && <small className="billing-error">{planChange.error.message}</small>}

          <section className="account-card payment-history-card">
            <div className="payment-history-heading">
              <div>
                <h2>Payment history</h2>
                <p>Your subscription charges, add-on purchases, and renewal attempts.</p>
              </div>
              <strong>{payments?.total ?? 0} payments</strong>
            </div>
            <div className="payment-table-wrap">
              <table className="payment-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Provider</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {payments?.items.map((payment) => {
                    const paidTime = new Date(payment.paidAt ?? payment.createdAt).getTime();
                    const isWithin48h = Date.now() - paidTime <= 48 * 60 * 60 * 1000;

                    return (
                      <tr key={payment.id}>
                        <td>{new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString()}</td>
                        <td className="payment-provider">{payment.provider}</td>
                        <td>{payment.description ?? 'Pro subscription'}</td>
                        <td>
                          <span className={`payment-status ${payment.status}`}>{payment.status}</span>
                        </td>
                        <td>
                          {new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency }).format(payment.amount / 100)}
                        </td>
                        <td>
                          {payment.status !== 'succeeded' || payment.amount <= 0 ? (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          ) : payment.refundRequestStatus === 'pending' ? (
                            <span
                              className="payment-status pending"
                              title={payment.refundRequestReason ? `Reason: ${payment.refundRequestReason}` : 'Refund request pending admin review'}
                              style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}
                            >
                              Requested
                            </span>
                          ) : payment.refundRequestStatus === 'approved' ? (
                            <span
                              className="payment-status succeeded"
                              style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap', backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}
                            >
                              Approved
                            </span>
                          ) : payment.refundRequestStatus === 'rejected' ? (
                            <span
                              className="payment-status failed"
                              title={payment.refundRejectionReason ? `Reason: ${payment.refundRejectionReason}` : 'Refund request rejected'}
                              style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}
                            >
                              Rejected
                            </span>
                          ) : isWithin48h ? (
                            <button
                              type="button"
                              className="subscription-link danger"
                              style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem', border: '1px solid var(--danger, #ef4444)', borderRadius: '4px', cursor: 'pointer' }}
                              disabled={refundRequestMutation.isPending}
                              onClick={() => {
                                const reason = window.prompt('Provide a reason for this refund request (optional):');
                                if (reason === null) return;
                                if (window.confirm('Request a refund for this payment? An administrator will review your request.')) {
                                  refundRequestMutation.mutate({ id: payment.id, reason: reason.trim() || undefined });
                                }
                              }}
                            >
                              Request refund
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }} title="Refund request window is within 2 days of payment">
                              Window expired
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!payments?.items.length && (
                    <tr>
                      <td colSpan={6} className="payment-empty">
                        No payment recorded yet. Payments appear after a provider webhook is received.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
