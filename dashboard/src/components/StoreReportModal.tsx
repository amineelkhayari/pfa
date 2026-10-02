import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ShoppingBag,
  Package,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertTriangle,
  PackageCheck,
  Download,
  Printer,
  X,
  Loader2,
  BarChart3,
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
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { storesApi, type Store, type StoreReportData } from '../services/api';
import { exportStoreReportCsv } from '../utils/csvExport';
import './StoreReportModal.css';

interface StoreReportModalProps {
  store: Store | null;
  onClose: () => void;
}

export const StoreReportModal: React.FC<StoreReportModalProps> = ({ store, onClose }) => {
  const [period, setPeriod] = useState<string>('30');

  const {
    data: report,
    isLoading: loadingReport,
  } = useQuery<StoreReportData>({
    queryKey: ['store', store?.id, 'report', period],
    queryFn: () => storesApi.report(store!.id, period),
    enabled: !!store?.id,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['store', store?.id, 'orders'],
    queryFn: () => storesApi.orders(store!.id),
    enabled: !!store?.id,
  });

  if (!store) return null;

  const summary = report?.summary;
  const status = report?.statusBreakdown;
  const evolution = report?.evolution ?? [];
  const currency = summary?.currency || store.currency || 'MAD';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleExportCsv = () => {
    if (!report) return;
    exportStoreReportCsv(report, orders);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="store-report-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="store-report-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <header className="report-modal-header">
          <div className="report-title-group">
            <div className="report-icon-wrapper">
              <BarChart3 size={22} />
            </div>
            <div>
              <div className="report-title-row">
                <h2>{store.name} — Store Analytics & Evolution</h2>
                <span className={`store-badge ${store.provider}`}>{store.provider}</span>
              </div>
              <p className="report-subtitle">
                Sales performance, order fulfillment, WhatsApp confirmation rate, and daily evolution.
              </p>
            </div>
          </div>

          <div className="report-header-actions">
            {/* Time period filter */}
            <div className="period-toggle-group">
              {[
                { key: '7', label: '7D' },
                { key: '14', label: '14D' },
                { key: '30', label: '30D' },
                { key: '90', label: '90D' },
                { key: 'all', label: 'All' },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`period-btn ${period === opt.key ? 'active' : ''}`}
                  onClick={() => setPeriod(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Export buttons */}
            <button
              type="button"
              className="btn-export-csv"
              onClick={handleExportCsv}
              disabled={!report}
              title="Download detailed Excel/CSV Report"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              className="btn-print"
              onClick={handlePrint}
              title="Print or Save as PDF"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              className="btn-close-modal"
              onClick={onClose}
              aria-label="Close report"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Body content */}
        <div className="report-modal-body">
          {loadingReport ? (
            <div className="report-loading">
              <Loader2 size={32} className="animate-spin" />
              <span>Generating store analytics...</span>
            </div>
          ) : !report ? (
            <div className="report-empty">
              <AlertTriangle size={32} />
              <p>No report data available for this store.</p>
            </div>
          ) : (
            <>
              {/* Top 4 KPI Metric Cards */}
              <div className="report-kpi-grid">
                {/* Total Revenue */}
                <div className="kpi-card revenue-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Total Revenue</span>
                    <div className="kpi-icon revenue">
                      <TrendingUp size={18} />
                    </div>
                  </div>
                  <div className="kpi-value">{formatCurrency(summary?.totalRevenue ?? 0)}</div>
                  <div className="kpi-meta">
                    <span>Avg order value: </span>
                    <strong>{formatCurrency(summary?.averageOrderValue ?? 0)}</strong>
                  </div>
                </div>

                {/* Total Orders */}
                <div className="kpi-card orders-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Total Orders</span>
                    <div className="kpi-icon orders">
                      <ShoppingBag size={18} />
                    </div>
                  </div>
                  <div className="kpi-value">{summary?.totalOrders ?? 0}</div>
                  <div className="kpi-meta">
                    <strong>{summary?.confirmedOrders ?? 0}</strong>
                    <span> confirmed on WhatsApp</span>
                  </div>
                </div>

                {/* Confirmation Rate */}
                <div className="kpi-card confirmation-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Confirmation Rate</span>
                    <div className="kpi-icon rate">
                      <Percent size={18} />
                    </div>
                  </div>
                  <div className="kpi-value">{summary?.confirmationRate ?? 0}%</div>
                  <div className="kpi-progress-bar">
                    <div
                      className="kpi-progress-fill"
                      style={{ width: `${Math.min(100, summary?.confirmationRate ?? 0)}%` }}
                    />
                  </div>
                </div>

                {/* Total Products */}
                <div className="kpi-card products-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Catalog Products</span>
                    <div className="kpi-icon products">
                      <Package size={18} />
                    </div>
                  </div>
                  <div className="kpi-value">{summary?.totalProducts ?? 0}</div>
                  <div className="kpi-meta">
                    <span>Synchronized catalog items</span>
                  </div>
                </div>
              </div>

              {/* Status Breakdown Pills */}
              <div className="report-status-section">
                <h3 className="section-title">Order Status Breakdown</h3>
                <div className="status-pills-grid">
                  <div className="status-pill confirmed">
                    <CheckCircle2 size={16} />
                    <div>
                      <span className="count">{status?.confirmed ?? 0}</span>
                      <span className="label">Confirmed via WhatsApp</span>
                    </div>
                  </div>

                  <div className="status-pill fulfilled">
                    <PackageCheck size={16} />
                    <div>
                      <span className="count">{status?.fulfilled ?? 0}</span>
                      <span className="label">Fulfilled & Closed</span>
                    </div>
                  </div>

                  <div className="status-pill pending">
                    <Clock3 size={16} />
                    <div>
                      <span className="count">{status?.pending ?? 0}</span>
                      <span className="label">Awaiting Reply</span>
                    </div>
                  </div>

                  <div className="status-pill cancelled">
                    <XCircle size={16} />
                    <div>
                      <span className="count">{status?.cancelled ?? 0}</span>
                      <span className="label">Cancelled</span>
                    </div>
                  </div>

                  <div className="status-pill not-sent">
                    <Clock3 size={16} />
                    <div>
                      <span className="count">{status?.notSent ?? 0}</span>
                      <span className="label">Not Sent</span>
                    </div>
                  </div>

                  <div className="status-pill failed">
                    <AlertTriangle size={16} />
                    <div>
                      <span className="count">{status?.failed ?? 0}</span>
                      <span className="label">Delivery Failed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Evolution Graphs */}
              <div className="report-charts-grid">
                {/* 1. Revenue Evolution AreaChart */}
                <div className="chart-panel">
                  <div className="chart-panel-header">
                    <div>
                      <h4>Revenue Evolution Over Time</h4>
                      <span className="chart-subtitle">Daily sales revenue in {currency}</span>
                    </div>
                  </div>
                  <div className="chart-container">
                    {evolution.length === 0 ? (
                      <div className="chart-no-data">No order revenue in this period.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={evolution} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#25d366" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#25d366" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                            stroke="var(--border)"
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                            stroke="var(--border)"
                            tickFormatter={val => `${val}`}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const val = Number(payload[0].value ?? 0);
                              return (
                                <div className="chart-custom-tooltip">
                                  <strong>{label}</strong>
                                  <div className="tooltip-row">
                                    <span>Revenue:</span>
                                    <b>{formatCurrency(val)}</b>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            name="Revenue"
                            stroke="#25d366"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#revenueGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* 2. Order Volume & Evolution BarChart */}
                <div className="chart-panel">
                  <div className="chart-panel-header">
                    <div>
                      <h4>Order Volume & Status Evolution</h4>
                      <span className="chart-subtitle">Daily count of orders by status</span>
                    </div>
                  </div>
                  <div className="chart-container">
                    {evolution.length === 0 ? (
                      <div className="chart-no-data">No orders recorded in this period.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={evolution} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                            stroke="var(--border)"
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                            stroke="var(--border)"
                          />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Bar dataKey="confirmed" name="Confirmed" fill="#25d366" stackId="a" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="fulfilled" name="Fulfilled" fill="#0284c7" stackId="a" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="pending" name="Awaiting Reply" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" stackId="a" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
