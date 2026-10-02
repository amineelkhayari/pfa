import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Loader2,
  ShoppingCart,
  Clock3,
  CircleCheck,
  XCircle,
  Bot,
  Megaphone,
  Smartphone,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Store,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useSessionsQuery,
  useSessionStatsQuery,
  useOrderConfirmationSummaryQuery,
  useAccountUsageQuery,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { PlanUpgradeNotice, planLimitReason } from '../components/PlanLimitGate';
import { campaignApi } from '../services/api';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { RecentOrdersFeed } from '../components/RecentOrdersFeed';
import './Dashboard.css';

// recharts is heavy (~150kB gzip); load the analytics section on demand so it never bloats the
// main/login bundle and only ships when the dashboard actually renders.
// const DashboardCharts = lazy(() => import('../components/DashboardCharts').then(m => ({ default: m.DashboardCharts })));

export function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t('dashboard.title'));
  const navigate = useNavigate();
  const { isLoading: loadingSessions, error: sessionsError } = useSessionsQuery();
  const { data: stats } = useSessionStatsQuery();
  const [orderDays, setOrderDays] = useState(30);
  const [orderType, setOrderType] = useState('all');
  const { data: orderSummary } = useOrderConfirmationSummaryQuery({
    days: orderDays || undefined,
    type: orderType,
  });
  const { data: accountUsage } = useAccountUsageQuery();
  const { data: campaignReport } = useQuery({
    queryKey: ['campaign-report'],
    queryFn: campaignApi.report,
    refetchInterval: 30_000,
  });

  const accountLimitReason = accountUsage
    ? planLimitReason(accountUsage, 'receivedMessages') ||
      planLimitReason(accountUsage, 'sentMessages') ||
      planLimitReason(accountUsage, 'aiTokens') ||
      planLimitReason(accountUsage, 'sessions') ||
      planLimitReason(accountUsage, 'stores')
    : null;

  const messagesToday = campaignReport?.summary.todaySent ?? 0;
  const loading = loadingSessions;
  const error =
    sessionsError instanceof Error ? sessionsError.message : sessionsError ? t('dashboard.loadError') : null;

  // 4 Core Executive KPIs (Zero duplication across the page)
  const statsCards = [
    {
      label: 'WhatsApp Status',
      value: stats?.ready ? `${stats.ready} Active` : 'Disconnected',
      icon: Smartphone,
      detail: stats?.ready ? `${stats.total} registered engine` : 'Scan QR to connect',
    },
    {
      label: 'Confirmation Rate',
      value: orderSummary?.total ? `${Math.round((orderSummary.confirmed / orderSummary.total) * 100)}%` : '0%',
      icon: CircleCheck,
      detail: orderSummary ? `${orderSummary.confirmed} confirmed of ${orderSummary.total} orders` : 'No orders yet',
    },
    {
      label: 'COD Delivery Savings',
      value: `$${Math.round((orderSummary?.cancelled ?? 0) * 4.5).toLocaleString()}`,
      icon: ShieldCheck,
      detail: `${orderSummary?.cancelled ?? 0} fake/cancelled orders intercepted`,
    },
    {
      label: 'Messages Sent Today',
      value: messagesToday.toLocaleString(),
      icon: Send,
      detail: campaignReport ? `${campaignReport.summary.successRate}% delivery rate` : 'Outgoing WhatsApp messages',
    },
  ];

  // 4 Pipeline metrics for the order verification hub (removes duplicate stores/products)
  const pipelineCards = [
    {
      label: 'Total Ingested',
      value: orderSummary?.total ?? 0,
      icon: ShoppingCart,
      tone: 'total',
      desc: 'Orders synced from stores',
    },
    {
      label: 'Awaiting Reply',
      value: orderSummary?.pending ?? 0,
      icon: Clock3,
      tone: 'pending',
      desc: 'Customer response pending',
    },
    {
      label: 'Confirmed & Verified',
      value: orderSummary?.confirmed ?? 0,
      icon: CircleCheck,
      tone: 'confirmed',
      desc: 'Ready for shipping dispatch',
    },
    {
      label: 'Cancelled / Avoided',
      value: orderSummary?.cancelled ?? 0,
      icon: XCircle,
      tone: 'cancelled',
      desc: `Saved ~$${Math.round((orderSummary?.cancelled ?? 0) * 4.5)} return costs`,
    },
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

      <OnboardingWizard
        hasReadySession={(stats?.ready ?? 0) > 0}
        hasStore={(orderSummary?.totalStores ?? 0) > 0}
        hasConfirmedOrders={(orderSummary?.confirmed ?? 0) > 0}
      />

      {/* Quick Action Toolbar */}
      <div className="dashboard-quick-actions">
        <button type="button" className="quick-action-btn" onClick={() => navigate('/sessions')}>
          <Smartphone size={16} />
          <span>WhatsApp QR</span>
        </button>
        <button type="button" className="quick-action-btn" onClick={() => navigate('/stores')}>
          <Store size={16} />
          <span>Connect Store</span>
        </button>
        <button type="button" className="quick-action-btn" onClick={() => navigate('/chats')}>
          <MessageSquare size={16} />
          <span>Live Chats</span>
        </button>
        <button type="button" className="quick-action-btn" onClick={() => navigate('/ai-test')}>
          <Bot size={16} />
          <span>Test AI Bot</span>
        </button>
        <button type="button" className="quick-action-btn" onClick={() => navigate('/campaigns')}>
          <Megaphone size={16} />
          <span>New Broadcast</span>
        </button>
      </div>

      {/* Top Executive KPI Grid (4 Distinct Metrics) */}
      <div className="stats-grid">
        {statsCards.map(({ label, value, icon: Icon, detail }) => (
          <div key={label} className="stat-card">
            <Icon className="stat-watermark" />
            <div className="stat-header">
              <span className="stat-label">{label}</span>
              <Icon size={20} className="stat-icon" />
            </div>
            <div className="stat-value">{value}</div>
            {detail && <div className="stat-detail">{detail}</div>}
          </div>
        ))}
      </div>

      {/* Compact Account Allowance & Tier Bar */}
      {accountUsage && (
        <section className="account-tier-card">
          <div className="tier-info">
            <div className="tier-badge">
              <Sparkles size={14} />
              <span>{accountUsage.plan === 'pro' ? 'Pro Plan' : 'Free Trial'}</span>
            </div>
            <span className="tier-meta">
              {accountUsage.plan === 'free'
                ? accountUsage.trialExpired
                  ? 'Trial expired — upgrade required to continue automation'
                  : `One-time trial ends ${new Date(accountUsage.trialEndsAt!).toLocaleDateString()}`
                : 'Current monthly subscription allowance'}
            </span>
          </div>

          <div className="tier-gauges">
            <div className="tier-gauge-item">
              <div className="gauge-label">
                <span>Monthly Messages</span>
                <strong>
                  {accountUsage.usage.sentMessages.toLocaleString()} / {accountUsage.limits.sentMessages.toLocaleString()}
                </strong>
              </div>
              <div className="usage-track">
                <span
                  style={{
                    width: `${
                      accountUsage.limits.sentMessages > 0
                        ? Math.min(100, Math.round((accountUsage.usage.sentMessages / accountUsage.limits.sentMessages) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="tier-gauge-item">
              <div className="gauge-label">
                <span>AI Context Tokens</span>
                <strong>
                  {accountUsage.usage.aiTokens.toLocaleString()} / {accountUsage.limits.aiTokens.toLocaleString()}
                </strong>
              </div>
              <div className="usage-track">
                <span
                  style={{
                    width: `${
                      accountUsage.limits.aiTokens > 0
                        ? Math.min(100, Math.round((accountUsage.usage.aiTokens / accountUsage.limits.aiTokens) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="tier-gauge-item">
              <div className="gauge-label">
                <span>WhatsApp Sessions</span>
                <strong>
                  {accountUsage.usage.sessions} / {accountUsage.limits.sessions}
                </strong>
              </div>
              <div className="usage-track">
                <span
                  style={{
                    width: `${
                      accountUsage.limits.sessions > 0
                        ? Math.min(100, Math.round((accountUsage.usage.sessions / accountUsage.limits.sessions) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {accountUsage.plan === 'free' && (
            <button type="button" className="btn-upgrade-sm" onClick={() => navigate('/account')}>
              Upgrade to Pro · $5/mo
            </button>
          )}
        </section>
      )}

      {accountLimitReason && <PlanUpgradeNotice reason={accountLimitReason} />}

      {/* Unified Commerce & Order Verification Hub */}
      <section className="commerce-summary">
        <div className="section-header">
          <div>
            <h2>Order Confirmations & Protection</h2>
            <span className="section-subtitle">Real-time WhatsApp verification stream and delivery status</span>
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
            <button type="button" className="btn-sm" onClick={() => navigate('/stores')}>
              <span>View Stores</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* 4 Clean Pipeline Stat Pills */}
        <div className="commerce-pipeline-grid">
          {pipelineCards.map(({ label, value, icon: Icon, tone, desc }) => (
            <div key={label} className={`pipeline-pill-card ${tone}`}>
              <div className="pipeline-pill-head">
                <span className="pipeline-pill-label">{label}</span>
                <Icon size={18} className="pipeline-pill-icon" />
              </div>
              <div className="pipeline-pill-val">{value.toLocaleString()}</div>
              <span className="pipeline-pill-desc">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Live Order Confirmations Stream */}
      <RecentOrdersFeed />

      {/* Unified Automations & Broadcast Hub (2-Column Side-by-Side) */}
      <section className="automation-hub-section">
        <div className="automation-hub-grid">
          {/* Column 1: AI Sales Copilot */}
          <div className="hub-panel">
            <div className="hub-panel-header">
              <div className="hub-title-group">
                <div className="hub-icon-wrap ai">
                  <Bot size={20} />
                </div>
                <div>
                  <h3>AI Sales Copilot</h3>
                  <span className="hub-subtitle">Conversational order handling & support</span>
                </div>
              </div>
              <button type="button" className="btn-sm" onClick={() => navigate('/ai-test')}>
                Test Agent
              </button>
            </div>

            <div className="hub-metrics-grid">
              <div className="hub-metric-tile">
                <span className="hub-label">Autonomous Resolutions</span>
                <strong className="hub-val">{orderSummary?.aiPerformance.confirmed ?? 0} orders</strong>
                <small className="text-success">
                  <TrendingUp size={12} /> {orderSummary?.aiPerformance.confirmationRate ?? 0}% close rate
                </small>
              </div>

              <div className="hub-metric-tile">
                <span className="hub-label">AI Conversations</span>
                <strong className="hub-val">{orderSummary?.aiPerformance.conversations ?? 0}</strong>
                <small className="text-muted">
                  {orderSummary?.aiPerformance.active ?? 0} active · {orderSummary?.aiPerformance.escalated ?? 0} handed off
                </small>
              </div>
            </div>
          </div>

          {/* Column 2: Broadcast Campaigns */}
          <div className="hub-panel">
            <div className="hub-panel-header">
              <div className="hub-title-group">
                <div className="hub-icon-wrap campaign">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h3>Broadcast Campaigns</h3>
                  <span className="hub-subtitle">Marketing messages & delivery performance</span>
                </div>
              </div>
              <button type="button" className="btn-sm" onClick={() => navigate('/campaigns')}>
                New Broadcast
              </button>
            </div>

            <div className="hub-metrics-grid">
              <div className="hub-metric-tile">
                <span className="hub-label">Delivery Success</span>
                <strong className="hub-val text-success">
                  {campaignReport?.summary.successRate ?? 0}%
                </strong>
                <small className="text-muted">
                  {campaignReport?.summary.pendingMessages ?? 0} pending in queue
                </small>
              </div>

              <div className="hub-metric-tile">
                <span className="hub-label">Active Campaigns</span>
                <strong className="hub-val">
                  {campaignReport?.summary.activeCampaigns ?? 0}
                </strong>
                <small className={campaignReport?.summary.highRiskCampaigns ? 'text-danger' : 'text-muted'}>
                  {campaignReport?.summary.highRiskCampaigns ?? 0} high-risk warnings
                </small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Activity Analytics Chart */}
      {/* <Suspense fallback={null}>
        <DashboardCharts sessions={orderSummary?.sessions ?? []} />
      </Suspense> */}

      {/* Unified Connected Stores & WhatsApp Channels Table */}
      <section className="operations-section">
        <div className="section-header">
          <div>
            <h2>Connected Stores & WhatsApp Channels</h2>
            <span className="section-subtitle">Synced stores, linked WhatsApp numbers, and automated order health</span>
          </div>
          <button type="button" className="btn-sm" onClick={() => navigate('/stores')}>
            Manage stores
          </button>
        </div>

        <div className="store-operations-table">
          <div className="store-operation-header">
            <span>Store</span>
            <span>WhatsApp Device</span>
            <span>Catalog & Orders</span>
            <span>Confirmations</span>
            <span>AI Status</span>
            <span>Health</span>
          </div>

          {(orderSummary?.stores ?? []).map(store => (
            <div className="store-operation-row" key={store.id}>
              <div>
                <strong>{store.name}</strong>
                <small className={`store-badge ${store.provider}`}>{store.provider}</small>
              </div>

              <div>
                <b>{store.sessionName || 'No device'}</b>
                <small className="text-muted">
                  {store.sent} ↑ · {store.received} ↓ messages
                </small>
              </div>

              <div>
                <b>{store.products} products</b>
                <small>{store.orders} total orders</small>
              </div>

              <div>
                <b className="confirmed-text">{store.confirmed} confirmed</b>
                <small>
                  {store.pending} pending · {store.cancelled} cancelled
                </small>
              </div>

              <div>
                <b>
                  <Bot size={14} /> {store.aiActive} active
                </b>
                <small>{store.aiEscalated} handoffs</small>
              </div>

              <div>
                <span className={`status-pill ${store.sessionStatus}`}>
                  {formatStatus(store.sessionStatus)}
                </span>
                <small>{formatLastActive(store.lastOrderAt || store.lastMessageAt)}</small>
              </div>
            </div>
          ))}

          {!orderSummary?.stores.length && (
            <div className="operation-empty">
              No connected stores found. Link your Shopify, WooCommerce, or YouCan store in the Stores tab.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
