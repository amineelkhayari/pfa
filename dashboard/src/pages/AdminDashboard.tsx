import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UsersRound,
  Store,
  Package,
  ShoppingCart,
  Smartphone,
  CreditCard,
  CircleDollarSign,
  Bot,
  Server,
  Puzzle,
  Activity,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Download,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { PageHeader } from '../components/PageHeader';
import {
  adminBillingApi,
  adminUsersApi,
  statsApi,
  infraApi,
  type StatsPeriod,
} from '../services/api';
import { exportAdminPlatformCsv } from '../utils/csvExport';
import './AdminDashboard.css';

export function AdminDashboard() {
  const navigate = useNavigate();
  const [throughputPeriod, setThroughputPeriod] = useState<StatsPeriod>('7d');
  const [planChartView, setPlanChartView] = useState<'revenue' | 'subscribers' | 'history'>('revenue');

  const { data: users } = useQuery({ queryKey: ['admin', 'users', 'summary'], queryFn: adminUsersApi.summary });
  const { data: stats } = useQuery({ queryKey: ['stats', 'overview'], queryFn: statsApi.getOverview });
  const { data: resources } = useQuery({ queryKey: ['admin', 'resources'], queryFn: adminUsersApi.resources });
  const { data: plans = [] } = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminBillingApi.plans });
  const { data: billing } = useQuery({
    queryKey: ['admin', 'billing-history', 'dashboard'],
    queryFn: () => adminBillingApi.history({ limit: 50 }),
  });
  const { data: infra } = useQuery({ queryKey: ['infra', 'status'], queryFn: infraApi.getStatus });

  // Time-Series Message Evolution across the platform
  const { data: messageStats, isLoading: loadingChart } = useQuery({
    queryKey: ['stats', 'messages', throughputPeriod],
    queryFn: () => statsApi.getMessages(throughputPeriod),
  });

  const earnings =
    billing?.summary.earnings
      .map(item =>
        new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency }).format(item.amount / 100),
      )
      .join(' · ') || '$0.00';

  const shortcuts = [
    {
      title: 'Users & Subscriptions',
      subtitle: `${users?.total ?? 0} merchants registered`,
      icon: UsersRound,
      to: '/admin/users',
      color: 'blue',
    },
    {
      title: 'Billing & Plans',
      subtitle: `${plans.length} plans · Gateways & revenue`,
      icon: CreditCard,
      to: '/admin/payments',
      color: 'green',
    },
    {
      title: 'Global AI & Model Config',
      subtitle: 'OpenRouter, prompt & token settings',
      icon: Bot,
      to: '/admin/ai',
      color: 'purple',
    },
    {
      title: 'Automation & AI Logs',
      subtitle: 'Tool executions & customer conversations',
      icon: Activity,
      to: '/admin/automation-logs',
      color: 'amber',
    },
    {
      title: 'Infrastructure & DB',
      subtitle: 'Postgres/SQLite, Redis, S3/MinIO',
      icon: Server,
      to: '/infrastructure',
      color: 'cyan',
    },
    {
      title: 'Integration Plugins',
      subtitle: 'Fabric connectors & sandboxed bots',
      icon: Puzzle,
      to: '/plugins',
      color: 'pink',
    },
  ];

  // Subscription Plan & Revenue Metrics Calculation
  const planCurrency = plans[0]?.currency || 'USD';
  const formatCurrency = (amount: number, curr = planCurrency) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(amount);

  const planMetrics = plans.map(plan => {
    const subscribers = users?.byPlan?.[plan.slug] ?? 0;
    const price = (plan.priceMonthly ?? 0) / 100;
    const monthlyRevenue = Number((subscribers * price).toFixed(2));
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      price,
      subscribers,
      revenue: monthlyRevenue,
      currency: plan.currency || planCurrency,
      limits: plan.limits,
    };
  });

  const totalMrr = planMetrics.reduce((sum, p) => sum + p.revenue, 0);
  const totalArr = totalMrr * 12;
  const payingSubscribers = planMetrics.filter(p => p.price > 0).reduce((sum, p) => sum + p.subscribers, 0);
  const totalMerchants = users?.total ?? 0;
  const conversionRate = totalMerchants > 0 ? Math.round((payingSubscribers / totalMerchants) * 100) : 0;

  // Chronological payment history from billing transactions
  const paymentHistoryTimeline = (billing?.items || [])
    .filter(tx => tx.status === 'succeeded' || tx.status === 'refunded')
    .map(tx => {
      const date = tx.paidAt ? new Date(tx.paidAt) : new Date(tx.createdAt);
      const amount = (tx.status === 'refunded' ? -tx.amount : tx.amount) / 100;
      return {
        date: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        amount: Math.max(0, amount),
        currency: tx.currency ? tx.currency.toUpperCase() : planCurrency,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Chart timestamp formatting for throughput
  const formatTimestamp = (ts: unknown) => {
    if (!ts) return '';
    const str = String(ts);
    if (throughputPeriod === '24h') {
      const parts = str.split(' ');
      return parts[1] ? parts[1].slice(0, 5) : str.slice(11, 16);
    }
    try {
      const d = new Date(str);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return str;
    }
  };

  const handleExportCsv = () => {
    exportAdminPlatformCsv({
      merchantsCount: users?.total ?? 0,
      activeMerchants: users?.active ?? 0,
      netEarnings: earnings,
      totalMessages: (stats?.messages.sent ?? 0) + (stats?.messages.received ?? 0),
      activeSessions: stats?.sessions.active ?? 0,
      registeredSessions: resources?.sessions ?? 0,
      connectedStores: resources?.stores ?? 0,
      catalogProducts: resources?.products ?? 0,
      ingestedOrders: resources?.orders ?? 0,
      messageTimeSeries: messageStats?.timeSeries,
    });
  };

  return (
    <div className="admin-dashboard-page">
      <PageHeader
        title="Admin Command Center"
        subtitle="Platform vitals, tenant control, and revenue analytics"
        badge={
          <span className="admin-status-badge live">
            <ShieldCheck size={14} />
            <span>Platform Healthy</span>
          </span>
        }
        actions={
          <button type="button" className="btn-secondary" onClick={handleExportCsv}>
            <Download size={15} />
            <span>Export Platform CSV</span>
          </button>
        }
      />

      {/* Quick Platform Shortcuts (Responsive auto-fit grid) */}
      <section className="admin-section">
        <div className="admin-section-header">
          <h2>Quick Management Controls</h2>
          <span className="admin-section-hint">Direct access to manage platform settings</span>
        </div>
        <div className="admin-shortcuts-grid">
          {shortcuts.map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.to}
                className={`admin-shortcut-card tone-${item.color}`}
                onClick={() => navigate(item.to)}
              >
                <div className="admin-shortcut-icon">
                  <Icon size={22} />
                </div>
                <div className="admin-shortcut-content">
                  <h3>{item.title}</h3>
                  <p>{item.subtitle}</p>
                </div>
                <ArrowRight size={18} className="admin-shortcut-arrow" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Core Vitals Grid */}
      <section className="admin-section">
        <div className="admin-section-header">
          <h2>Key Business & System Vitals</h2>
        </div>
        <div className="admin-vitals-grid">
          <div className="admin-vital-card">
            <div className="vital-header">
              <span className="vital-label">Total Merchants</span>
              <UsersRound size={18} className="vital-icon" />
            </div>
            <div className="vital-value">{users?.total?.toLocaleString() ?? 0}</div>
            <div className="vital-footer">
              <span className="tag-positive">{users?.active ?? 0} active</span>
              {users?.suspended ? <span className="tag-warning">{users.suspended} suspended</span> : null}
            </div>
          </div>

          <div className="admin-vital-card">
            <div className="vital-header">
              <span className="vital-label">Net Platform Earnings</span>
              <CircleDollarSign size={18} className="vital-icon text-success" />
            </div>
            <div className="vital-value">{earnings}</div>
            <div className="vital-footer">
              <span>{billing?.summary.activeSubscribers ?? 0} active paid subscribers</span>
            </div>
          </div>

          <div className="admin-vital-card">
            <div className="vital-header">
              <span className="vital-label">Messages Throughput</span>
              <TrendingUp size={18} className="vital-icon" />
            </div>
            <div className="vital-value">
              {((stats?.messages.sent ?? 0) + (stats?.messages.received ?? 0)).toLocaleString()}
            </div>
            <div className="vital-footer">
              <span>
                {stats?.messages.sent?.toLocaleString() ?? 0} sent · {stats?.messages.received?.toLocaleString() ?? 0} received
              </span>
            </div>
          </div>

          <div className="admin-vital-card">
            <div className="vital-header">
              <span className="vital-label">Active WhatsApp Engines</span>
              <Smartphone size={18} className="vital-icon" />
            </div>
            <div className="vital-value">{stats?.sessions.active ?? 0}</div>
            <div className="vital-footer">
              <span>of {resources?.sessions ?? 0} registered sessions</span>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Plans & Platform Revenue Analytics (Interactive Graph Section) */}
      <section className="admin-section">
        <div className="admin-section-header admin-section-between">
          <div>
            <h2>Subscription Plans & Revenue Analytics</h2>
            <span className="admin-section-hint">Performance, subscriber distribution, and MRR evolution across plan tiers</span>
          </div>
          <div className="admin-period-toggles">
            <button
              type="button"
              className={`period-toggle-btn ${planChartView === 'revenue' ? 'active' : ''}`}
              onClick={() => setPlanChartView('revenue')}
            >
              Revenue by Plan ($)
            </button>
            <button
              type="button"
              className={`period-toggle-btn ${planChartView === 'subscribers' ? 'active' : ''}`}
              onClick={() => setPlanChartView('subscribers')}
            >
              Subscribers by Plan
            </button>
            <button
              type="button"
              className={`period-toggle-btn ${planChartView === 'history' ? 'active' : ''}`}
              onClick={() => setPlanChartView('history')}
            >
              Payment History
            </button>
          </div>
        </div>

        {/* 4 Financial & Subscription KPI Summary Cards */}
        <div className="admin-financial-kpi-grid">
          <div className="financial-kpi-card">
            <div className="financial-kpi-head">
              <span>Projected MRR</span>
              <CircleDollarSign size={18} className="text-success" />
            </div>
            <div className="financial-kpi-value">{formatCurrency(totalMrr)}</div>
            <span className="financial-kpi-detail">Monthly Recurring Revenue</span>
          </div>

          <div className="financial-kpi-card">
            <div className="financial-kpi-head">
              <span>Annual Run Rate (ARR)</span>
              <TrendingUp size={18} className="text-info" />
            </div>
            <div className="financial-kpi-value">{formatCurrency(totalArr)}</div>
            <span className="financial-kpi-detail">Annualized subscription run-rate</span>
          </div>

          <div className="financial-kpi-card">
            <div className="financial-kpi-head">
              <span>Paying Subscribers</span>
              <CreditCard size={18} className="text-primary" />
            </div>
            <div className="financial-kpi-value">{payingSubscribers}</div>
            <span className="financial-kpi-detail">
              {payingSubscribers > 0
                ? `${payingSubscribers} active paying merchants`
                : '0 active paid subscriptions'}
            </span>
          </div>

          <div className="financial-kpi-card">
            <div className="financial-kpi-head">
              <span>Paid Conversion Rate</span>
              <Percent size={18} className="text-warning" />
            </div>
            <div className="financial-kpi-value">{conversionRate}%</div>
            <span className="financial-kpi-detail">
              {payingSubscribers} of {totalMerchants} total registered
            </span>
          </div>
        </div>

        {/* Visual Graph Card */}
        <div className="admin-chart-card">
          <div className="plan-chart-meta">
            <span className="plan-chart-title">
              {planChartView === 'revenue' && 'Monthly Revenue Contribution by Plan Tier'}
              {planChartView === 'subscribers' && 'Merchant Subscription Distribution across Plan Tiers'}
              {planChartView === 'history' && 'Historical Payments & Subscription Billing Timeline'}
            </span>
            <span className="plan-chart-subtitle">
              {planChartView === 'revenue' && `Comparing recurring income generated per tier (${planCurrency})`}
              {planChartView === 'subscribers' && 'Active subscriber counts per plan configuration'}
              {planChartView === 'history' && 'Actual collected payments received via Stripe & PayPal'}
            </span>
          </div>

          <div className="chart-container">
            {planChartView === 'history' ? (
              paymentHistoryTimeline.length === 0 ? (
                <div className="chart-empty">No payment transactions recorded in billing history yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={paymentHistoryTimeline}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="historyRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                      tickFormatter={v => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        boxShadow: 'var(--shadow-lg)',
                        fontSize: '12px',
                      }}
                      formatter={(val: unknown) => [formatCurrency(Number(val)), 'Payment Collected']}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Revenue"
                      stroke="#22c55e"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#historyRevenueGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )
            ) : planMetrics.length === 0 ? (
              <div className="chart-empty">No subscription plans configured.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={planMetrics}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    tickFormatter={v => (planChartView === 'revenue' ? `$${v}` : `${v}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text-primary)',
                      boxShadow: 'var(--shadow-lg)',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => [
                      planChartView === 'revenue' ? formatCurrency(Number(val)) : `${val} merchants`,
                      planChartView === 'revenue' ? 'Monthly Revenue' : 'Subscribers',
                    ]}
                  />
                  <Bar
                    dataKey={planChartView === 'revenue' ? 'revenue' : 'subscribers'}
                    name={planChartView === 'revenue' ? 'Monthly Revenue' : 'Subscribers'}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={60}
                  >
                    {planMetrics.map(entry => (
                      <Cell
                        key={`cell-${entry.slug}`}
                        fill={entry.price > 0 ? '#22c55e' : '#3b82f6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {planChartView === 'history' ? (
              <div className="chart-legend-custom">
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#22c55e' }} /> Net Collected Payment ($)
                </span>
              </div>
            ) : (
              <div className="chart-legend-custom">
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#3b82f6' }} /> Free Plan Tier
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#22c55e' }} /> Paid Subscription Tiers
                </span>
              </div>
            )}

            {planChartView === 'revenue' && totalMrr === 0 && (
              <div style={{ textAlign: 'center', padding: '0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.82rem', border: '1px dashed var(--border)' }}>
                💡 <strong>Currently $0.00 MRR:</strong> All {totalMerchants} registered accounts are on the Free tier (no active recurring subscriptions). When a merchant subscribes to Pro or Basic, recurring income appears here. Click the <strong>Payment History</strong> tab above to view all past collected charges & refunds.
              </div>
            )}
          </div>
        </div>

        {planChartView === 'history' ? (
          <div className="admin-recent-payments-card" style={{ marginTop: '1.25rem', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Transaction History Ledger</h4>
                <small style={{ color: 'var(--text-muted)' }}>Audit trail of payments and refunds collected via Stripe & PayPal</small>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                onClick={() => navigate('/payment-settings')}
              >
                Full Payment Settings &rarr;
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-muted, rgba(0,0,0,0.02))' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Customer</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Provider</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(billing?.items || []).slice(0, 10).map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <div><strong>{new Date(tx.paidAt ?? tx.createdAt).toLocaleDateString()}</strong></div>
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {new Date(tx.paidAt ?? tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <div><strong>{tx.user?.name ?? 'Merchant'}</strong></div>
                        <small style={{ color: 'var(--text-muted)' }}>{tx.user?.email}</small>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className={`provider-badge ${tx.provider}`}>{tx.provider}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className={`status-pill ${tx.status}`}>{tx.status}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: tx.currency }).format(tx.amount / 100)}
                      </td>
                    </tr>
                  ))}
                  {(!billing?.items || billing.items.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Detailed Plan Breakdown Grid */
          <div className="admin-plans-summary-grid">
            {planMetrics.map(plan => {
              const share = totalMerchants > 0 ? Math.round((plan.subscribers / totalMerchants) * 100) : 0;
              return (
                <div key={plan.id} className="admin-plan-summary-card">
                  <div className="plan-summary-header">
                    <div className="plan-title-block">
                      <h4>{plan.name}</h4>
                      <span className="plan-price-tag">
                        {plan.price > 0 ? `${formatCurrency(plan.price, plan.currency)} / mo` : 'Free Trial'}
                      </span>
                    </div>
                    <span className="plan-share-badge">{share}% share</span>
                  </div>

                  <div className="plan-summary-stats">
                    <div className="plan-stat-item">
                      <span className="stat-label">Subscribers</span>
                      <strong>{plan.subscribers} merchants</strong>
                    </div>
                    <div className="plan-stat-item">
                      <span className="stat-label">Monthly MRR</span>
                      <strong className={plan.revenue > 0 ? 'text-success' : ''}>
                        {formatCurrency(plan.revenue, plan.currency)}
                      </strong>
                    </div>
                  </div>

                  <div className="plan-limits-inline">
                    <span>Sessions: <b>{plan.limits?.sessions ?? 1}</b></span>
                    <span>·</span>
                    <span>Stores: <b>{plan.limits?.stores ?? 1}</b></span>
                    <span>·</span>
                    <span>Messages: <b>{(plan.limits?.sentMessages ?? 0).toLocaleString()}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Platform Evolution & Message Throughput Graph */}
      <section className="admin-section">
        <div className="admin-section-header admin-section-between">
          <div>
            <h2>Throughput & Activity Evolution</h2>
            <span className="admin-section-hint">Hourly & daily WhatsApp traffic handled by SmartConfirm</span>
          </div>
          <div className="admin-period-toggles">
            {(['24h', '7d', '30d'] as StatsPeriod[]).map(p => (
              <button
                key={p}
                type="button"
                className={`period-toggle-btn ${throughputPeriod === p ? 'active' : ''}`}
                onClick={() => setThroughputPeriod(p)}
              >
                {p === '24h' ? '24 Hours' : p === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-chart-card">
          {loadingChart ? (
            <div className="chart-loading">Loading evolution data...</div>
          ) : !messageStats?.timeSeries || messageStats.timeSeries.length === 0 ? (
            <div className="chart-empty">No throughput traffic recorded for this period.</div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={messageStats.timeSeries}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="adminSentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25d366" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#25d366" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="adminRecvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatTimestamp}
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      borderRadius: '10px',
                      color: 'var(--text-primary)',
                      boxShadow: 'var(--shadow-lg)',
                      fontSize: '12px',
                    }}
                    labelFormatter={formatTimestamp}
                  />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    name="Sent Messages"
                    stroke="#25d366"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#adminSentGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="received"
                    name="Received Messages"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#adminRecvGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="chart-legend-custom">
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#25d366' }} /> Sent (Verification Reminders)
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#3b82f6' }} /> Received (Customer Responses)
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Two Column Layout: Plan Distribution & Resource Overview */}
      <div className="admin-two-col-grid">
        <section className="admin-section-card">
          <div className="card-header">
            <h3>Plan Configurations & Pricing</h3>
            <button
              type="button"
              className="btn-action-sm"
              onClick={() => navigate('/admin/payments')}
            >
              Configure Plans
            </button>
          </div>
          <div className="admin-plans-table">
            {plans.map(plan => {
              const count = users?.byPlan?.[plan.slug] ?? 0;
              return (
                <div key={plan.id} className="admin-plan-row">
                  <div className="admin-plan-info">
                    <strong>{plan.name}</strong>
                    <span>
                      {new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency || 'USD' }).format(
                        (plan.priceMonthly ?? 0) / 100,
                      )}{' '}
                      / month
                    </span>
                  </div>
                  <div className="admin-plan-customers">
                    <span className="customer-count-badge">{count} customers</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="admin-section-card">
          <div className="card-header">
            <h3>Connected Platform Resources</h3>
            <button
              type="button"
              className="btn-action-sm"
              onClick={() => navigate('/infrastructure')}
            >
              View Infra
            </button>
          </div>
          <div className="admin-resources-list">
            <div className="resource-item">
              <div className="resource-left">
                <Store size={18} />
                <span>Connected E-Commerce Stores</span>
              </div>
              <strong>{resources?.stores ?? 0}</strong>
            </div>
            <div className="resource-item">
              <div className="resource-left">
                <Package size={18} />
                <span>Synced Catalog Products</span>
              </div>
              <strong>{resources?.products?.toLocaleString() ?? 0}</strong>
            </div>
            <div className="resource-item">
              <div className="resource-left">
                <ShoppingCart size={18} />
                <span>Ingested Orders</span>
              </div>
              <strong>{resources?.orders?.toLocaleString() ?? 0}</strong>
            </div>
            <div className="resource-item">
              <div className="resource-left">
                <Server size={18} />
                <span>Database Engine</span>
              </div>
              <strong className="text-capitalize">{infra?.database?.type || 'SQLite'}</strong>
            </div>
            <div className="resource-item">
              <div className="resource-left">
                <Activity size={18} />
                <span>Redis Queue Storage</span>
              </div>
              <strong>{infra?.redis?.connected ? 'Connected' : 'In-Memory'}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
