import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  WalletCards,
  Globe2,
  CheckCircle2,
  RefreshCw,
  Layers,
  DollarSign,
  Search,
  RotateCcw,
  Check,
  Copy,
  Loader2,
  UsersRound,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminBillingApi } from '../services/api';
import { formatBillingDate, subscriptionSchedule } from '../utils/subscriptionSchedule';
import { PlanManager } from '../components/PlanManager';
import { copyToClipboard } from '../utils/clipboard';
import { useToast } from '../hooks/useToast';
import './Account.css';
import './PaymentSettings.css';

type BillingTab = 'subscriptions' | 'transactions' | 'plans' | 'gateways';

export function PaymentSettings() {
  const client = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<BillingTab>('subscriptions');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Transaction Ledger Filters
  const [filters, setFilters] = useState({
    provider: '',
    status: '',
    from: '',
    to: '',
    search: '',
    page: 1,
  });

  // Subscription Filters
  const [subSearch, setSubSearch] = useState('');
  const [subProvider, setSubProvider] = useState('');
  const [subStatus, setSubStatus] = useState('');

  // Data Queries
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'billing-settings'],
    queryFn: adminBillingApi.get,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['admin', 'billing-history', filters],
    queryFn: () => adminBillingApi.history({ ...filters, limit: 20 }),
  });

  const { data: subscriptions = [], isLoading: subsLoading } = useQuery({
    queryKey: ['admin', 'billing-subscriptions'],
    queryFn: () => adminBillingApi.subscriptions(),
  });

  // Gateway form state
  const [form, setForm] = useState<Record<string, any>>({
    stripeEnabled: false,
    paypalEnabled: false,
    paypalEnvironment: 'sandbox',
    publicAppUrl: '',
  });

  useEffect(() => {
    if (data) {
      setForm(current => ({
        ...current,
        publicAppUrl: data.publicAppUrl ?? '',
        stripeEnabled: data.stripeEnabled,
        paypalEnabled: data.paypalEnabled,
        paypalEnvironment: data.paypalEnvironment,
        freeTrialDays: data.freeTrialDays,
        freeSessionLimit: data.freeSessionLimit,
        freeStoreLimit: data.freeStoreLimit,
        freeSentMessageLimit: data.freeSentMessageLimit,
        freeReceivedMessageLimit: data.freeReceivedMessageLimit,
        freeAiTokenLimit: data.freeAiTokenLimit,
        proAiTokenLimit: data.proAiTokenLimit,
      }));
    }
  }, [data]);

  // Mutations
  const save = useMutation({
    mutationFn: () => adminBillingApi.update(form),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'billing-settings'] });
      toast.success('Billing & Gateway settings saved successfully.');
    },
    onError: err => {
      toast.error('Failed to save settings', err instanceof Error ? err.message : undefined);
    },
  });

  const paymentAction = useMutation({
    mutationFn: async (input: {
      type: 'refund' | 'cancel' | 'reactivate' | 'cancel-change' | 'reconcile' | 'approve-refund' | 'reject-refund';
      id: string;
      amount?: number;
      immediate?: boolean;
      reason?: string;
    }) => {
      if (input.type === 'approve-refund') {
        return adminBillingApi.approveRefund(input.id);
      }
      if (input.type === 'reject-refund') {
        return adminBillingApi.rejectRefund(input.id, input.reason);
      }
      if (input.type === 'refund') {
        return adminBillingApi.refund(input.id, input.amount, input.reason || 'Refunded by administrator');
      }
      if (input.type === 'cancel') {
        return adminBillingApi.cancelSubscription(input.id, Boolean(input.immediate), 'Cancelled by administrator');
      }
      if (input.type === 'reactivate') {
        return adminBillingApi.reactivateSubscription(input.id);
      }
      if (input.type === 'cancel-change') {
        return adminBillingApi.cancelPlanChange(input.id);
      }
      return adminBillingApi.reconcileSubscription(input.id);
    },
    onSuccess: (_, variables) => {
      void client.invalidateQueries({ queryKey: ['admin', 'billing-history'] });
      void client.invalidateQueries({ queryKey: ['admin', 'billing-subscriptions'] });
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });

      const label =
        variables.type === 'approve-refund'
          ? 'Refund approved and issued'
          : variables.type === 'reject-refund'
            ? 'Refund request rejected'
            : variables.type === 'refund'
              ? 'Payment refunded'
              : variables.type === 'reconcile'
                ? 'Subscription synced with provider'
                : variables.type === 'reactivate'
                  ? 'Subscription reactivated'
                  : variables.type === 'cancel-change'
                    ? 'Pending plan change cancelled'
                    : 'Subscription cancelled';
      toast.success(label);
    },
    onError: err => {
      toast.error('Action failed', err instanceof Error ? err.message : undefined);
    },
  });

  // Copy helper
  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
      toast.info('Copied to clipboard');
    }
  };

  // Filtered Subscriptions
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(sub => {
      if (subProvider && sub.provider !== subProvider) return false;
      if (subStatus) {
        const s = sub.status.toLowerCase();
        if (subStatus === 'cancelling' && !sub.cancelAtPeriodEnd) return false;
        if (subStatus === 'active' && (s !== 'active' || sub.cancelAtPeriodEnd)) return false;
        if (subStatus === 'trialing' && s !== 'trialing') return false;
        if (subStatus === 'expired' && !['cancelled', 'canceled', 'expired'].includes(s)) return false;
      }
      if (subSearch) {
        const query = subSearch.toLowerCase();
        const name = sub.user?.name?.toLowerCase() ?? '';
        const email = sub.user?.email?.toLowerCase() ?? '';
        const plan = sub.planSlug?.toLowerCase() ?? '';
        if (!name.includes(query) && !email.includes(query) && !plan.includes(query)) return false;
      }
      return true;
    });
  }, [subscriptions, subSearch, subProvider, subStatus]);

  // Financial KPI Metrics
  const activeSubscribers = useMemo(() => {
    if (history?.summary?.activeSubscribers !== undefined) {
      return history.summary.activeSubscribers;
    }
    return subscriptions.filter(s => ['active', 'trialing'].includes(s.status?.toLowerCase())).length;
  }, [history, subscriptions]);

  const grossRevenue = useMemo(() => {
    if (history?.summary?.earnings && history.summary.earnings.length > 0) {
      return history.summary.earnings
        .map(e =>
          new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: e.currency,
            maximumFractionDigits: 2,
          }).format(e.amount / 100),
        )
        .join(' · ');
    }
    const totalCents =
      history?.items
        ?.filter(p => p.status === 'succeeded')
        ?.reduce((acc, p) => acc + (p.amount - (p.refundedAmount || 0)), 0) ?? 0;
    const currency = history?.items?.[0]?.currency ?? 'USD';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(totalCents / 100);
  }, [history]);

  const successfulCount = history?.summary?.successful ?? history?.items?.filter(p => p.status === 'succeeded').length ?? 0;
  const failedCount = history?.summary?.failed ?? history?.items?.filter(p => p.status === 'failed').length ?? 0;

  const publicUrl = form.publicAppUrl || window.location.origin;
  const stripeWebhookUrl = `${publicUrl}/api/billing/webhook/stripe`;
  const paypalWebhookUrl = `${publicUrl}/api/billing/webhook/paypal`;

  return (
    <div className="billing-page">
      <PageHeader
        title="Billing & Plans"
        subtitle="Manage merchant subscriptions, transaction ledger, pricing tiers, and payment gateways"
      />

      {/* Top Financial KPI Summary Cards */}
      <section className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <div className="kpi-content">
            <span className="kpi-eyebrow">Active Subscribers</span>
            <span className="kpi-value">{activeSubscribers}</span>
            <span className="kpi-detail">{subscriptions.length} total merchants on record</span>
          </div>
          <div className="kpi-icon-wrap blue">
            <UsersRound size={22} />
          </div>
        </div>

        <div className="billing-kpi-card">
          <div className="kpi-content">
            <span className="kpi-eyebrow">Total Revenue Processed</span>
            <span className="kpi-value">{grossRevenue || '$0.00'}</span>
            <span className="kpi-detail">{successfulCount} successful payments</span>
          </div>
          <div className="kpi-icon-wrap green">
            <DollarSign size={22} />
          </div>
        </div>

        <div className="billing-kpi-card">
          <div className="kpi-content">
            <span className="kpi-eyebrow">Payment Success Rate</span>
            <span className="kpi-value">
              {successfulCount + failedCount > 0
                ? `${Math.round((successfulCount / (successfulCount + failedCount)) * 100)}%`
                : '100%'}
            </span>
            <span className="kpi-detail">{failedCount} failed transaction attempts</span>
          </div>
          <div className="kpi-icon-wrap purple">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="billing-kpi-card">
          <div className="kpi-content">
            <span className="kpi-eyebrow">Live Gateways</span>
            <span className="kpi-value">
              {Number(form.stripeEnabled) + Number(form.paypalEnabled)} / 2
            </span>
            <span className="kpi-detail">
              Stripe: {form.stripeEnabled ? 'Live' : 'Off'} · PayPal: {form.paypalEnabled ? 'Live' : 'Off'}
            </span>
          </div>
          <div className="kpi-icon-wrap amber">
            <CreditCard size={22} />
          </div>
        </div>
      </section>

      {/* Horizontal Navigation Tabs */}
      <nav className="billing-tabs-container">
        <button
          type="button"
          className={`billing-tab-btn ${tab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setTab('subscriptions')}
        >
          <UsersRound size={18} />
          <span>Subscriptions</span>
          <span className="tab-badge">{subscriptions.length}</span>
        </button>

        <button
          type="button"
          className={`billing-tab-btn ${tab === 'transactions' ? 'active' : ''}`}
          onClick={() => setTab('transactions')}
        >
          <DollarSign size={18} />
          <span>Transactions & Ledger</span>
          <span className="tab-badge">{history?.total ?? 0}</span>
        </button>

        <button
          type="button"
          className={`billing-tab-btn ${tab === 'plans' ? 'active' : ''}`}
          onClick={() => setTab('plans')}
        >
          <Layers size={18} />
          <span>Plans & Pricing</span>
        </button>

        <button
          type="button"
          className={`billing-tab-btn ${tab === 'gateways' ? 'active' : ''}`}
          onClick={() => setTab('gateways')}
        >
          <SlidersHorizontal size={18} />
          <span>Gateways & Credentials</span>
        </button>
      </nav>

      {/* TAB 1: Subscriptions */}
      {tab === 'subscriptions' && (
        <section className="billing-card">
          <div className="billing-card-header">
            <div className="billing-card-title">
              <h2>Merchant Subscriptions</h2>
              <p>Monitor renewals, plan changes, and customer access across payment providers.</p>
            </div>
          </div>

          <div className="billing-filters-bar">
            <div className="billing-search-box">
              <Search size={16} className="billing-search-icon" />
              <input
                className="billing-search-input"
                placeholder="Search merchant name, email, or plan..."
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
              />
            </div>

            <div className="billing-filter-group">
              <select
                className="billing-select"
                value={subProvider}
                onChange={e => setSubProvider(e.target.value)}
              >
                <option value="">All Providers</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
              </select>

              <select
                className="billing-select"
                value={subStatus}
                onChange={e => setSubStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="cancelling">Cancelling at period end</option>
                <option value="expired">Expired / Cancelled</option>
              </select>

              {(subSearch || subProvider || subStatus) && (
                <button
                  type="button"
                  className="billing-btn-reset"
                  onClick={() => {
                    setSubSearch('');
                    setSubProvider('');
                    setSubStatus('');
                  }}
                >
                  <RotateCcw size={14} /> Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="billing-table-wrapper">
            <table className="billing-data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Provider & Plan</th>
                  <th>Status</th>
                  <th>Renewal / Effective Schedule</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscriptions.map(subscription => {
                  const schedule = subscriptionSchedule(subscription);
                  const changing = ['pending_payment', 'pending_approval', 'scheduled'].includes(
                    subscription.planChangeStatus,
                  );
                  const initials = (subscription.user?.name || subscription.user?.email || 'U')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr key={subscription.id}>
                      <td>
                        <div className="customer-cell">
                          <div className="customer-avatar">{initials}</div>
                          <div className="customer-meta">
                            <strong>{subscription.user?.name ?? 'Unknown Customer'}</strong>
                            <small>{subscription.user?.email ?? 'No email'}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`provider-badge ${subscription.provider}`}>
                          {subscription.provider}
                        </span>
                        <div>
                          <span className="plan-pill">{subscription.planSlug}</span>
                          {subscription.pendingPlanSlug && (
                            <span className="plan-change-badge">
                              Changing to: {subscription.pendingPlanSlug}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`status-pill ${subscription.cancelAtPeriodEnd ? 'cancelling' : subscription.status.toLowerCase()}`}
                        >
                          {subscription.cancelAtPeriodEnd ? 'cancelling' : subscription.status}
                        </span>
                        <div style={{ marginTop: '0.25rem' }}>
                          <small style={{ color: 'var(--text-muted)' }}>
                            {subscription.pendingPlanSlug
                              ? subscription.planChangeStatus.replaceAll('_', ' ')
                              : schedule.autoRenew
                                ? 'Auto-renew on'
                                : 'Auto-renew off'}
                          </small>
                        </div>
                      </td>

                      <td>
                        <small style={{ color: 'var(--text-muted)', display: 'block' }}>
                          {subscription.pendingPlanSlug ? 'Change effective' : schedule.label}
                        </small>
                        <strong>
                          {formatBillingDate(
                            subscription.pendingPlanSlug
                              ? subscription.planChangeEffectiveAt
                              : schedule.date,
                          )}
                        </strong>
                      </td>

                      <td>
                        <div className="table-actions-cell">
                          <button
                            type="button"
                            className="btn-table-action primary"
                            disabled={paymentAction.isPending}
                            onClick={() =>
                              paymentAction.mutate({ type: 'reconcile', id: subscription.id })
                            }
                            title="Re-check subscription status with payment gateway"
                          >
                            <RefreshCw size={13} /> Sync
                          </button>

                          {changing &&
                            !(
                              subscription.provider === 'stripe' &&
                              subscription.planChangeStatus === 'pending_payment'
                            ) &&
                            !(
                              subscription.provider === 'paypal' &&
                              subscription.planChangeStatus === 'scheduled'
                            ) && (
                              <button
                                type="button"
                                className="btn-table-action danger"
                                disabled={paymentAction.isPending}
                                onClick={() => {
                                  if (window.confirm('Cancel this pending plan change?')) {
                                    paymentAction.mutate({
                                      type: 'cancel-change',
                                      id: subscription.id,
                                    });
                                  }
                                }}
                              >
                                Cancel change
                              </button>
                            )}

                          {subscription.cancelAtPeriodEnd && subscription.provider === 'stripe' && (
                            <button
                              type="button"
                              className="btn-table-action primary"
                              disabled={paymentAction.isPending}
                              onClick={() =>
                                paymentAction.mutate({
                                  type: 'reactivate',
                                  id: subscription.id,
                                })
                              }
                            >
                              Reactivate
                            </button>
                          )}

                          {['active', 'trialing'].includes(subscription.status.toLowerCase()) &&
                            !changing && (
                              <>
                                <button
                                  type="button"
                                  className="btn-table-action subtle-danger"
                                  disabled={paymentAction.isPending}
                                  onClick={() => {
                                    const msg =
                                      subscription.provider === 'paypal'
                                        ? 'PayPal cancellation is immediate. Continue?'
                                        : 'Schedule subscription cancellation at period end?';
                                    if (window.confirm(msg)) {
                                      paymentAction.mutate({
                                        type: 'cancel',
                                        id: subscription.id,
                                      });
                                    }
                                  }}
                                >
                                  Cancel renewal
                                </button>

                                {subscription.provider === 'stripe' && (
                                  <button
                                    type="button"
                                    className="btn-table-action danger"
                                    disabled={paymentAction.isPending}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          'Cancel immediately? The merchant will lose Pro features right now. (No automatic refund).',
                                        )
                                      ) {
                                        paymentAction.mutate({
                                          type: 'cancel',
                                          id: subscription.id,
                                          immediate: true,
                                        });
                                      }
                                    }}
                                  >
                                    Cancel now
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!subsLoading && !filteredSubscriptions.length && (
                  <tr>
                    <td colSpan={5} className="billing-empty-state">
                      <div className="billing-empty-inner">
                        <UsersRound size={32} />
                        <strong>No subscriptions found</strong>
                        <p>No merchant subscriptions match the selected search or filter criteria.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: Transactions & Ledger */}
      {tab === 'transactions' && (
        <section className="billing-card">
          <div className="billing-card-header">
            <div className="billing-card-title">
              <h2>Transaction Ledger & Refunds</h2>
              <p>Historical audit trail of all checkout attempts, recurring charges, and refund requests.</p>
            </div>
          </div>

          <div className="billing-filters-bar">
            <div className="billing-search-box">
              <Search size={16} className="billing-search-icon" />
              <input
                className="billing-search-input"
                placeholder="Search payment ID or customer..."
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })}
              />
            </div>

            <div className="billing-filter-group">
              <select
                className="billing-select"
                value={filters.provider}
                onChange={e => setFilters({ ...filters, provider: e.target.value, page: 1 })}
              >
                <option value="">All Providers</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
              </select>

              <select
                className="billing-select"
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}
              >
                <option value="">All Statuses</option>
                <option value="succeeded">Succeeded</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
                <option value="pending">Pending</option>
              </select>

              <input
                type="date"
                className="billing-date-input"
                title="From date"
                value={filters.from}
                onChange={e => setFilters({ ...filters, from: e.target.value, page: 1 })}
              />

              <input
                type="date"
                className="billing-date-input"
                title="To date"
                value={filters.to}
                onChange={e => setFilters({ ...filters, to: e.target.value, page: 1 })}
              />

              {(filters.search || filters.provider || filters.status || filters.from || filters.to) && (
                <button
                  type="button"
                  className="billing-btn-reset"
                  onClick={() =>
                    setFilters({ provider: '', status: '', from: '', to: '', search: '', page: 1 })
                  }
                >
                  <RotateCcw size={14} /> Reset
                </button>
              )}
            </div>
          </div>

          <div className="billing-table-wrapper">
            <table className="billing-data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  <th>Gateway</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history?.items.map(payment => {
                  const initials = (payment.user?.name || payment.user?.email || 'U')
                    .slice(0, 2)
                    .toUpperCase();
                  const isRefundable =
                    payment.status === 'succeeded' && payment.refundedAmount < payment.amount;

                  return (
                    <tr key={payment.id}>
                      <td>
                        <strong>{new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString()}</strong>
                        <small style={{ color: 'var(--text-muted)', display: 'block' }}>
                          {new Date(payment.paidAt ?? payment.createdAt).toLocaleTimeString()}
                        </small>
                      </td>

                      <td>
                        <div className="customer-cell">
                          <div className="customer-avatar">{initials}</div>
                          <div className="customer-meta">
                            <strong>{payment.user?.name ?? 'Unknown Customer'}</strong>
                            <small>{payment.user?.email ?? 'No email'}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`provider-badge ${payment.provider}`}>
                          {payment.provider}
                        </span>
                      </td>

                      <td>
                        <span className={`status-pill ${payment.status}`}>
                          {payment.status}
                        </span>
                        {payment.refundRequestStatus === 'pending' && (
                          <div style={{ marginTop: '0.35rem' }}>
                            <span
                              className="status-pill pending"
                              style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.72rem', fontWeight: 600, display: 'inline-block' }}
                              title="Customer requested a refund"
                            >
                              Refund Requested
                            </span>
                            {payment.refundRequestReason && (
                              <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.15rem', maxWidth: '200px', wordBreak: 'break-word' }}>
                                "{payment.refundRequestReason}"
                              </small>
                            )}
                          </div>
                        )}
                        {payment.refundRequestStatus === 'approved' && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span
                              className="status-pill succeeded"
                              style={{ backgroundColor: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 600, display: 'inline-block' }}
                            >
                              Refund Approved
                            </span>
                          </div>
                        )}
                        {payment.refundRequestStatus === 'rejected' && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span
                              className="status-pill failed"
                              style={{ fontSize: '0.72rem', display: 'inline-block' }}
                              title={payment.refundRejectionReason ? `Reason: ${payment.refundRejectionReason}` : undefined}
                            >
                              Request Rejected
                            </span>
                          </div>
                        )}
                      </td>

                      <td>
                        <strong>
                          {new Intl.NumberFormat(undefined, {
                            style: 'currency',
                            currency: payment.currency,
                          }).format(payment.amount / 100)}
                        </strong>
                        {payment.refundedAmount > 0 && (
                          <small style={{ color: 'var(--warning)', display: 'block' }}>
                            Refunded:{' '}
                            {new Intl.NumberFormat(undefined, {
                              style: 'currency',
                              currency: payment.currency,
                            }).format(payment.refundedAmount / 100)}
                          </small>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {payment.refundRequestStatus === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="btn-table-action"
                                style={{ backgroundColor: '#16a34a', color: '#fff', borderColor: '#15803d' }}
                                disabled={paymentAction.isPending}
                                title="Approve refund request and return funds to customer"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Approve refund of ${new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency }).format(payment.amount / 100)} to customer via ${payment.provider.toUpperCase()}? This will also cancel the subscription and downgrade account.`,
                                    )
                                  ) {
                                    paymentAction.mutate({ type: 'approve-refund', id: payment.id });
                                  }
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn-table-action danger"
                                disabled={paymentAction.isPending}
                                title="Reject customer refund request"
                                onClick={() => {
                                  const reason = window.prompt('Reason for rejecting refund request (optional):');
                                  if (reason === null) return;
                                  paymentAction.mutate({ type: 'reject-refund', id: payment.id, reason: reason.trim() || undefined });
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {isRefundable && payment.refundRequestStatus !== 'pending' && (
                            <button
                              type="button"
                              className="btn-table-action danger"
                              disabled={paymentAction.isPending}
                              onClick={() => {
                                const remaining = (payment.amount - payment.refundedAmount) / 100;
                                const value = window.prompt(
                                  `Refund amount in ${payment.currency.toUpperCase()}.\nLeave empty for full remaining amount (${remaining.toFixed(2)}):`,
                                );
                                if (value === null) return;
                                const amount = value.trim()
                                  ? Math.round(Number(value) * 100)
                                  : undefined;
                                if (value.trim() && (!Number.isFinite(amount) || Number(amount) <= 0)) {
                                  return window.alert('Please enter a valid positive refund amount.');
                                }
                                if (
                                  window.confirm(
                                    `This issues a real refund to the customer via ${payment.provider.toUpperCase()}. Proceed?`,
                                  )
                                ) {
                                  paymentAction.mutate({ type: 'refund', id: payment.id, amount });
                                }
                              }}
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!historyLoading && !history?.items.length && (
                  <tr>
                    <td colSpan={6} className="billing-empty-state">
                      <div className="billing-empty-inner">
                        <DollarSign size={32} />
                        <strong>No transactions found</strong>
                        <p>No payment records match the specified search or filter parameters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="billing-pagination">
            <span>
              Page {filters.page} of {Math.max(1, Math.ceil((history?.total ?? 0) / 20))} ·{' '}
              {history?.total ?? 0} total records
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-pagination"
                disabled={filters.page <= 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-pagination"
                disabled={filters.page * 20 >= (history?.total ?? 0)}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Plans & Pricing */}
      {tab === 'plans' && (
        <section className="billing-card">
          <PlanManager />
        </section>
      )}

      {/* TAB 4: Gateways & Credentials */}
      {tab === 'gateways' && (
        <form
          onSubmit={e => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="gateways-grid">
            {/* Stripe Card */}
            <div className="gateway-card">
              <div className="gateway-header">
                <div className="gateway-title-group">
                  <div className="gateway-icon stripe">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h3>Stripe Integration</h3>
                    <p>Recurring Pro subscriptions via Stripe Checkout & Webhooks</p>
                  </div>
                </div>
                <span
                  className={`status-pill ${form.stripeEnabled ? 'succeeded' : 'failed'}`}
                >
                  {form.stripeEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="provider-switch-row">
                <span>
                  <strong>Enable Stripe Payments</strong>
                  <small>Permit customers to subscribe to plans via Stripe</small>
                </span>
                <input
                  type="checkbox"
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  checked={Boolean(form.stripeEnabled)}
                  onChange={e => setForm({ ...form, stripeEnabled: e.target.checked })}
                />
              </div>

              <div className="gateway-fields-list">
                <label className="gateway-field">
                  <span>Secret Key</span>
                  <input
                    type="password"
                    value={form.stripeSecretKey ?? ''}
                    placeholder={
                      data?.configured?.stripeSecretKey
                        ? 'Configured — leave blank to keep current key'
                        : 'sk_test_... or sk_live_...'
                    }
                    onChange={e => setForm({ ...form, stripeSecretKey: e.target.value })}
                  />
                  <small>Secret API key from your Stripe Developers Dashboard</small>
                </label>

                <label className="gateway-field">
                  <span>Pro Monthly Price ID</span>
                  <input
                    type="text"
                    value={form.stripePriceId ?? ''}
                    placeholder={
                      data?.configured?.stripePriceId
                        ? 'Configured — leave blank to keep current ID'
                        : 'price_1...'
                    }
                    onChange={e => setForm({ ...form, stripePriceId: e.target.value })}
                  />
                  <small>The recurring monthly Price identifier generated in Stripe</small>
                </label>

                <label className="gateway-field">
                  <span>Webhook Signing Secret</span>
                  <input
                    type="password"
                    value={form.stripeWebhookSecret ?? ''}
                    placeholder={
                      data?.configured?.stripeWebhookSecret
                        ? 'Configured — leave blank to keep current secret'
                        : 'whsec_...'
                    }
                    onChange={e => setForm({ ...form, stripeWebhookSecret: e.target.value })}
                  />
                  <small>Required to verify incoming Stripe webhook signatures</small>
                </label>

                <div className="webhook-helper-box">
                  <strong>Stripe Webhook URL</strong>
                  <div className="webhook-url-copy">
                    <code>{stripeWebhookUrl}</code>
                    <button
                      type="button"
                      className="btn-copy-sm"
                      onClick={() => handleCopy(stripeWebhookUrl, 'stripe')}
                      title="Copy webhook URL"
                    >
                      {copiedKey === 'stripe' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* PayPal Card */}
            <div className="gateway-card">
              <div className="gateway-header">
                <div className="gateway-title-group">
                  <div className="gateway-icon paypal">
                    <WalletCards size={20} />
                  </div>
                  <div>
                    <h3>PayPal Integration</h3>
                    <p>Recurring billing via PayPal Subscriptions & Webhooks</p>
                  </div>
                </div>
                <span
                  className={`status-pill ${form.paypalEnabled ? 'succeeded' : 'failed'}`}
                >
                  {form.paypalEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="provider-switch-row">
                <span>
                  <strong>Enable PayPal Payments</strong>
                  <small>Permit customers to subscribe to plans via PayPal</small>
                </span>
                <input
                  type="checkbox"
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  checked={Boolean(form.paypalEnabled)}
                  onChange={e => setForm({ ...form, paypalEnabled: e.target.checked })}
                />
              </div>

              <div className="gateway-fields-list">
                <label className="gateway-field">
                  <span>Environment</span>
                  <select
                    value={form.paypalEnvironment || 'sandbox'}
                    onChange={e => setForm({ ...form, paypalEnvironment: e.target.value })}
                  >
                    <option value="sandbox">Sandbox (Testing & Development)</option>
                    <option value="live">Live (Production Payments)</option>
                  </select>
                  <small>Keep in Sandbox mode until you are fully ready to charge real money</small>
                </label>

                <label className="gateway-field">
                  <span>Client ID</span>
                  <input
                    type="password"
                    value={form.paypalClientId ?? ''}
                    placeholder={
                      data?.configured?.paypalClientId
                        ? 'Configured — leave blank to keep current ID'
                        : 'PayPal REST App Client ID'
                    }
                    onChange={e => setForm({ ...form, paypalClientId: e.target.value })}
                  />
                  <small>PayPal REST Application Client identifier</small>
                </label>

                <label className="gateway-field">
                  <span>Client Secret</span>
                  <input
                    type="password"
                    value={form.paypalClientSecret ?? ''}
                    placeholder={
                      data?.configured?.paypalClientSecret
                        ? 'Configured — leave blank to keep current secret'
                        : 'PayPal REST App Secret'
                    }
                    onChange={e => setForm({ ...form, paypalClientSecret: e.target.value })}
                  />
                  <small>PayPal REST Application Secret</small>
                </label>

                <label className="gateway-field">
                  <span>Pro Monthly Plan ID</span>
                  <input
                    type="text"
                    value={form.paypalPlanId ?? ''}
                    placeholder={
                      data?.configured?.paypalPlanId
                        ? 'Configured — leave blank to keep current plan ID'
                        : 'P-...'
                    }
                    onChange={e => setForm({ ...form, paypalPlanId: e.target.value })}
                  />
                  <small>The recurring monthly Plan identifier generated in PayPal</small>
                </label>

                <label className="gateway-field">
                  <span>Webhook ID</span>
                  <input
                    type="password"
                    value={form.paypalWebhookId ?? ''}
                    placeholder={
                      data?.configured?.paypalWebhookId
                        ? 'Configured — leave blank to keep current webhook ID'
                        : 'PayPal Webhook ID'
                    }
                    onChange={e => setForm({ ...form, paypalWebhookId: e.target.value })}
                  />
                  <small>Identifies the registered PayPal webhook endpoint</small>
                </label>

                <div className="webhook-helper-box">
                  <strong>PayPal Webhook URL</strong>
                  <div className="webhook-url-copy">
                    <code>{paypalWebhookUrl}</code>
                    <button
                      type="button"
                      className="btn-copy-sm"
                      onClick={() => handleCopy(paypalWebhookUrl, 'paypal')}
                      title="Copy webhook URL"
                    >
                      {copiedKey === 'paypal' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* General Checkout URL Card */}
            <div className="gateway-card full-width">
              <div className="gateway-header">
                <div className="gateway-title-group">
                  <div className="gateway-icon general">
                    <Globe2 size={20} />
                  </div>
                  <div>
                    <h3>Public Checkout & Redirect Configuration</h3>
                    <p>Root URL used for checkout return URLs, billing portal redirects, and webhook verification</p>
                  </div>
                </div>
              </div>

              <div className="gateway-fields-list">
                <label className="gateway-field">
                  <span>Public Dashboard URL</span>
                  <input
                    type="url"
                    value={form.publicAppUrl ?? ''}
                    placeholder="https://app.yourdomain.com"
                    onChange={e => setForm({ ...form, publicAppUrl: e.target.value })}
                  />
                  <small>
                    Ensure this points to your public domain (HTTPS). Stripe and PayPal require public URLs for webhook deliveries and post-checkout redirects.
                  </small>
                </label>
              </div>
            </div>
          </div>

          {/* Sticky Save Bar */}
          <div className="gateways-save-bar">
            <div>
              {save.isSuccess && (
                <span className="gateways-status-notice success">
                  <CheckCircle2 size={18} /> Gateway credentials and checkout settings saved securely.
                </span>
              )}
              {save.isError && (
                <span className="gateways-status-notice error">
                  <AlertCircle size={18} /> {save.error.message}
                </span>
              )}
              {!save.isSuccess && !save.isError && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Credentials are encrypted at rest. Unchanged secrets are preserved automatically.
                </span>
              )}
            </div>

            <button
              type="submit"
              className="btn-save-gateways"
              disabled={save.isPending || isLoading}
            >
              {save.isPending ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {save.isPending ? 'Saving Settings…' : 'Save Gateway Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
