import { Suspense, useState } from 'react';
import { lazyWithRetry as lazy } from '../utils/lazyWithRetry';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Send,
  Webhook,
  Activity,
  Loader2,
  ShoppingCart,
  Clock3,
  CircleCheck,
  XCircle,
  TriangleAlert,
  Store,
  Package,
  Bot,
  ArrowUpRight,
  ArrowDownLeft,
  BrainCircuit,
  Gauge,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useSessionsQuery,
  useSessionStatsQuery,
  useWebhooksQuery,
  useStopSessionMutation,
  useStatsOverviewQuery,
  useOrderConfirmationSummaryQuery,
  useAccountUsageQuery,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { PlanUpgradeNotice, planLimitReason } from '../components/PlanLimitGate';
import './Dashboard.css';

// recharts is heavy (~150kB gzip); load the analytics section on demand so it never bloats the
// main/login bundle and only ships when the dashboard actually renders.
const DashboardCharts = lazy(() => import('../components/DashboardCharts').then(m => ({ default: m.DashboardCharts })));

export function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t('dashboard.title'));
  const navigate = useNavigate();
  const { isLoading: loadingSessions, error: sessionsError } = useSessionsQuery();
  const { data: stats } = useSessionStatsQuery();
  const { data: webhooks = [] } = useWebhooksQuery();
  // /stats/overview is ADMIN-only; for a non-admin key it 403s → overview stays undefined and the
  // message cards fall back to '—' without breaking the (un-gated) session cards.
  const { data: overview } = useStatsOverviewQuery();
  const [orderDays, setOrderDays] = useState(30);
  const [orderType, setOrderType] = useState('all');
  const { data: orderSummary } = useOrderConfirmationSummaryQuery({
    days: orderDays || undefined,
    type: orderType,
  });
  const { data: accountUsage } = useAccountUsageQuery();
  const accountLimitReason = accountUsage ? planLimitReason(accountUsage, 'receivedMessages') || planLimitReason(accountUsage, 'sentMessages') || planLimitReason(accountUsage, 'aiTokens') || planLimitReason(accountUsage, 'sessions') || planLimitReason(accountUsage, 'stores') : null;
  const stopMutation = useStopSessionMutation();
  const messagesToday = overview ? overview.messages.today.sent + overview.messages.today.received : '—';
  const totalMessages = overview ? overview.messages.sent + overview.messages.received : '—';
  const loading = loadingSessions;
  const error =
    sessionsError instanceof Error ? sessionsError.message : sessionsError ? t('dashboard.loadError') : null;
  const webhookCount = webhooks.length;

  const handleDisconnect = async (id: string) => {
    try {
      await stopMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const statsCards = [
    {
      // `stats.active` counts running engines — which includes initializing/qr_ready/connecting — so
      // it overstates what an operator reads as "connected". READY is the only status where the
      // session can actually send and receive.
      label: t('dashboard.stats.activeSessions'),
      value: stats?.ready ?? 0,
      icon: MessageSquare,
      detail: stats ? t('dashboard.stats.sessionsDetail', { running: stats.active, total: stats.total }) : undefined,
    },
    { label: t('dashboard.stats.messagesToday'), value: messagesToday, icon: Send },
    { label: t('dashboard.stats.webhooksConfigured'), value: webhookCount, icon: Webhook },
    { label: t('dashboard.stats.totalMessages'), value: totalMessages, icon: Activity },
  ];

  const orderCards = [
    { label: 'Total stores', value: orderSummary?.totalStores ?? 0, icon: Store, tone: 'total' },
    { label: 'Total products', value: orderSummary?.totalProducts ?? 0, icon: Package, tone: 'total' },
    { label: 'Total orders', value: orderSummary?.total ?? 0, icon: ShoppingCart, tone: 'total' },
    { label: 'Awaiting customer', value: orderSummary?.pending ?? 0, icon: Clock3, tone: 'pending' },
    { label: 'Confirmed', value: orderSummary?.confirmed ?? 0, icon: CircleCheck, tone: 'confirmed' },
    { label: 'Cancelled', value: orderSummary?.cancelled ?? 0, icon: XCircle, tone: 'cancelled' },
    { label: 'Failed', value: orderSummary?.failed ?? 0, icon: TriangleAlert, tone: 'failed' },
  ];

  const formatLastActive = (date?: string | null) => {
    if (!date) return t('common.never');
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return t('common.justNow');
    if (diff < 3600000) return t('common.minAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('common.hoursAgo', { count: Math.floor(diff / 3600000) });
    return new Date(date).toLocaleDateString();
  };

  const formatStatus = (status: string) => t(`sessionStatus.${status}`, { defaultValue: status });

  if (loading) {
    return (
      <div
        className="dashboard"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard" style={{ padding: '2rem' }}>
        <div
          style={{ background: 'rgba(239, 68, 68, 0.12)', padding: '1rem', borderRadius: '8px', color: 'var(--error)' }}
        >
          {t('dashboard.errorPrefix', { message: error })}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        badge={
          <span className={`status-badge ${stats && stats.ready > 0 ? 'connected' : 'disconnected'}`}>
            {stats && stats.ready > 0 ? t('common.connected') : t('common.disconnected')}
          </span>
        }
      />

      <div className="stats-grid">
        {statsCards.map(({ label, value, icon: Icon, detail }) => (
          <div key={label} className="stat-card">
            <Icon className="stat-watermark" />
            <div className="stat-header">
              <span className="stat-label">{label}</span>
              <Icon size={20} className="stat-icon" />
            </div>
            <div className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            {detail && <div className="stat-detail">{detail}</div>}
          </div>
        ))}
      </div>

      {accountUsage && (
        <section className="plan-usage">
          <div className="section-header">
            <div>
              <h2>{accountUsage.plan === 'pro' ? 'Pro plan' : 'Free plan'}</h2>
              <span className="section-subtitle">{accountUsage.plan === 'free' ? accountUsage.trialExpired ? 'Trial expired — upgrade required' : `One-time trial ends ${new Date(accountUsage.trialEndsAt!).toLocaleString()}` : 'Current monthly subscription usage'}</span>
            </div>
            {accountUsage.plan === 'free' && <button className="btn-sm" onClick={() => navigate('/account')}>Upgrade to Pro · $5/month</button>}
          </div>
          <div className="usage-grid">
            {([
              ['WhatsApp sessions', 'sessions'],
              ['Connected stores', 'stores'],
              ['Messages sent', 'sentMessages'],
              ['Messages received', 'receivedMessages'],
              ['AI context tokens', 'aiTokens'],
            ] as const).map(([label, key]) => {
              const used = accountUsage.usage[key];
              const limit = accountUsage.limits[key];
              const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
              return <div className="usage-item" key={key}>
                <div><span>{label}</span><strong>{used.toLocaleString()} / {limit.toLocaleString()}</strong></div>
                <div className="usage-track"><span style={{ width: `${percent}%` }} /></div>
              </div>;
            })}
          </div>
        </section>
      )}
      {accountLimitReason && <PlanUpgradeNotice reason={accountLimitReason} />}

      {accountUsage && (
        <section className="ai-performance">
          <div className="section-header">
            <div><h2>AI performance</h2><span className="section-subtitle">Context usage and order-confirmation outcomes for the selected period</span></div>
            <button className="btn-sm" onClick={() => navigate('/ai-test')}>Test AI agent</button>
          </div>
          <div className="ai-performance-grid">
            <div className="ai-performance-card"><span><BrainCircuit size={19}/> AI tokens used</span><strong>{accountUsage.usage.aiTokens.toLocaleString()}</strong><small>of {accountUsage.limits.aiTokens.toLocaleString()} plan tokens</small></div>
            <div className="ai-performance-card"><span><Gauge size={19}/> Token utilization</span><strong>{accountUsage.limits.aiTokens > 0 ? Math.min(100, Math.round(accountUsage.usage.aiTokens / accountUsage.limits.aiTokens * 100)) : 100}%</strong><small>{Math.max(0, accountUsage.limits.aiTokens - accountUsage.usage.aiTokens).toLocaleString()} tokens remaining</small></div>
            <div className="ai-performance-card success"><span><CircleCheck size={19}/> AI confirmation rate</span><strong>{orderSummary?.aiPerformance.confirmationRate ?? 0}%</strong><small>{orderSummary?.aiPerformance.confirmed ?? 0} confirmed of {(orderSummary?.aiPerformance.confirmed ?? 0) + (orderSummary?.aiPerformance.cancelled ?? 0)} completed decisions</small></div>
            <div className="ai-performance-card"><span><Bot size={19}/> AI conversations</span><strong>{orderSummary?.aiPerformance.conversations ?? 0}</strong><small>{orderSummary?.aiPerformance.active ?? 0} active · {orderSummary?.aiPerformance.escalated ?? 0} handed off</small></div>
          </div>
        </section>
      )}

      <section className="commerce-summary">
        <div className="section-header">
          <div>
            <h2>Customer confirmations</h2>
            <span className="section-subtitle">Live Shopify order responses received through WhatsApp</span>
          </div>
          <div className="commerce-actions">
            <label>
              <span>Date</span>
              <select value={orderDays} onChange={event => setOrderDays(Number(event.target.value))}>
                <option value={0}>All time</option>
                <option value={1}>Today</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
            <label>
              <span>Type</span>
              <select value={orderType} onChange={event => setOrderType(event.target.value)}>
                <option value="all">All confirmations</option>
                <option value="pending">Awaiting customer</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
                <option value="failed">Failed</option>
                <option value="not_sent">Not sent</option>
              </select>
            </label>
            <button className="btn-sm" onClick={() => navigate('/stores')}>
              View orders
            </button>
          </div>
        </div>
        <div className="commerce-stats-grid">
          {orderCards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`stat-card commerce-stat ${tone}`}>
              <Icon className="stat-watermark" />
              <div className="stat-header">
                <span className="stat-label">{label}</span>
                <Icon size={20} className="stat-icon" />
              </div>
              <div className="stat-value">{value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <DashboardCharts />
      </Suspense>

      <section className="operations-section">
        <div className="section-header">
          <div><h2>WhatsApp session performance</h2><span className="section-subtitle">Messages and order outcomes for the selected date range</span></div>
          <span className="section-subtitle">{orderSummary?.sessions.length ?? 0} sessions</span>
        </div>
        <div className="operations-grid">
          {(orderSummary?.sessions ?? []).map(session => {
            const handled = session.confirmed + session.cancelled;
            const rate = handled ? Math.round((session.confirmed / handled) * 100) : 0;
            return <article className="operation-card" key={session.id}>
              <div className="operation-card-head"><div><strong>{session.name}</strong><small>{session.phone || 'No phone'} · {session.storeName || 'No store linked'}</small></div><span className={`status-pill ${session.status}`}>{formatStatus(session.status)}</span></div>
              <div className="metric-row"><span><ArrowUpRight size={14}/> Sent <b>{session.sent.toLocaleString()}</b></span><span><ArrowDownLeft size={14}/> Received <b>{session.received.toLocaleString()}</b></span><span className={session.failed ? 'metric-danger' : ''}>Failed <b>{session.failed}</b></span></div>
              <div className="outcome-row"><span>Orders <b>{session.orders}</b></span><span>Pending <b>{session.pending}</b></span><span>Confirmed <b>{session.confirmed}</b></span><span>AI active <b>{session.aiActive}</b></span></div>
              <div className="success-line"><div><span>Confirmation success</span><b>{rate}%</b></div><div className="usage-track"><span style={{width: `${rate}%`}} /></div></div>
              <div className="operation-footer"><span>Last activity: {formatLastActive(session.lastMessageAt || session.lastActiveAt)}</span><div><button className="btn-sm" onClick={() => navigate('/sessions')}>Manage</button>{['ready','initializing','qr_ready'].includes(session.status) && <button className="btn-sm danger" onClick={() => handleDisconnect(session.id)}>Disconnect</button>}</div></div>
            </article>;
          })}
          {!orderSummary?.sessions.length && <div className="operation-empty">No WhatsApp sessions found.</div>}
        </div>
      </section>

      <section className="operations-section">
        <div className="section-header"><div><h2>Store performance</h2><span className="section-subtitle">Commerce, WhatsApp and AI health grouped by store</span></div><button className="btn-sm" onClick={() => navigate('/stores')}>Manage stores</button></div>
        <div className="store-operations-table">
          <div className="store-operation-header"><span>Store</span><span>Catalog</span><span>Messages</span><span>Confirmations</span><span>AI</span><span>Health</span></div>
          {(orderSummary?.stores ?? []).map(store => <div className="store-operation-row" key={store.id}>
            <div><strong>{store.name}</strong><small>{store.provider} · {store.sessionName || 'No session'}</small></div>
            <div><b>{store.products}</b><small>products · {store.orders} orders</small></div>
            <div><b>{store.sent} ↑ · {store.received} ↓</b><small className={store.failed ? 'metric-danger' : ''}>{store.failed} failed</small></div>
            <div><b className="confirmed-text">{store.confirmed} confirmed</b><small>{store.pending} pending · {store.cancelled} cancelled</small></div>
            <div><b><Bot size={14}/> {store.aiActive} active</b><small>{store.aiEscalated} handoffs</small></div>
            <div><span className={`status-pill ${store.sessionStatus}`}>{formatStatus(store.sessionStatus)}</span><small>{formatLastActive(store.lastOrderAt || store.lastMessageAt)}</small></div>
          </div>)}
          {!orderSummary?.stores.length && <div className="operation-empty">No stores found.</div>}
        </div>
      </section>
    </div>
  );
}
