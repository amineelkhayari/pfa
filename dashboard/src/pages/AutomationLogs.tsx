import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { commerceExecutionsApi } from '../services/api';
import './AutomationLogs.css';

export function AutomationLogs() {
  const [filters, setFilters] = useState({ status: '', provider: '', tool: '', from: '', to: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'commerce-executions', filters],
    queryFn: () => commerceExecutionsApi.list(filters),
  });
  const set = (name: keyof typeof filters, value: string) => setFilters(current => ({ ...current, [name]: value }));

  return (
    <div className="automation-logs">
      <PageHeader title="AI & Automation Logs" subtitle="Verified AI tool calls and commerce provider mutations" />
      <div className="execution-summary">
        {['succeeded', 'failed', 'uncertain', 'started'].map(status => (
          <div key={status}>
            <span>{status}</span>
            <strong>{data?.summary[status] ?? 0}</strong>
          </div>
        ))}
      </div>
      <div className="execution-filters">
        <select value={filters.status} onChange={e => set('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="uncertain">Uncertain</option>
          <option value="started">Started</option>
        </select>
        <select value={filters.provider} onChange={e => set('provider', e.target.value)}>
          <option value="">All providers</option>
          <option value="shopify">Shopify</option>
          <option value="woocommerce">WooCommerce</option>
          <option value="youcan">YouCan</option>
        </select>
        <input placeholder="Tool name" value={filters.tool} onChange={e => set('tool', e.target.value)} />
        <input type="date" value={filters.from} onChange={e => set('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={e => set('to', e.target.value)} />
      </div>
      <div className="execution-table">
        <div className="execution-row header">
          <span>Time</span>
          <span>Action</span>
          <span>Provider</span>
          <span>Status</span>
          <span>Customer</span>
          <span>Result</span>
        </div>
        {isLoading ? (
          <p>Loading automation activity…</p>
        ) : (
          data?.data.map(item => (
            <div className="execution-row" key={item.id}>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <strong>{item.tool}</strong>
              <span>{item.provider}</span>
              <span className={`execution-status ${item.status}`}>{item.status}</span>
              <span>{item.customerPhone ?? '—'}</span>
              <small>{item.errorMessage ?? (item.result ? JSON.stringify(item.result) : 'In progress')}</small>
            </div>
          ))
        )}
        {!isLoading && !data?.data.length && <p>No executions match these filters.</p>}
      </div>
    </div>
  );
}
