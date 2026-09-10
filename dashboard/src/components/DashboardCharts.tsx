import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { OrderConfirmationSummary } from '../services/api';
import './DashboardCharts.css';

type SessionPerformance = OrderConfirmationSummary['sessions'][number];

interface DashboardChartsProps {
  sessions: SessionPerformance[];
}

/** Tenant-safe dashboard chart built only from the account-scoped commerce summary. */
export function DashboardCharts({ sessions }: DashboardChartsProps) {
  const { t } = useTranslation();
  const data = sessions.slice(0, 12).map(session => ({
    name: session.name,
    sent: session.sent,
    received: session.received,
    confirmed: session.confirmed,
    pending: session.pending,
  }));

  return (
    <section className="dashboard-charts">
      <div className="charts-header">
        <div className="charts-title">
          <BarChart3 size={18} />
          <h2>Activity by WhatsApp session</h2>
        </div>
        <span className="section-subtitle">Account-owned sessions only</span>
      </div>
      {!data.length ? (
        <div className="charts-empty">{t('dashboard.charts.empty')}</div>
      ) : (
        <div className="charts-grid">
          <div className="chart-card chart-wide">
            <h3>Messages and confirmations</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="sent" name="Sent" fill="#25d366" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" name="Received" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="confirmed" name="Confirmed orders" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pending orders" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
