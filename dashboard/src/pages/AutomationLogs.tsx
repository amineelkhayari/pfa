import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Search,
  RotateCcw,
  RefreshCw,
  Eye,
  Wrench,
  Bot,
  Copy,
  Check,
  Calendar,
  Layers,
  ShoppingBag,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { commerceExecutionsApi, type CommerceExecution } from '../services/api';
import { Modal } from '../components/Modal';
import './AutomationLogs.css';

export function AutomationLogs() {
  const [filters, setFilters] = useState({
    status: '',
    provider: '',
    tool: '',
    from: '',
    to: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExecution, setSelectedExecution] = useState<CommerceExecution | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'commerce-executions', filters],
    queryFn: () => commerceExecutionsApi.list(filters),
    refetchInterval: 15_000,
  });

  const setFilter = (name: keyof typeof filters, value: string) => {
    setFilters(current => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({ status: '', provider: '', tool: '', from: '', to: '' });
    setSearchTerm('');
  };

  const hasActiveFilters = Boolean(
    filters.status || filters.provider || filters.tool || filters.from || filters.to || searchTerm
  );

  const filteredLogs = useMemo(() => {
    if (!data?.data) return [];
    if (!searchTerm.trim()) return data.data;
    const term = searchTerm.toLowerCase().trim();
    return data.data.filter(
      item =>
        item.tool?.toLowerCase().includes(term) ||
        item.provider?.toLowerCase().includes(term) ||
        item.customerPhone?.toLowerCase().includes(term) ||
        item.id?.toLowerCase().includes(term)
    );
  }, [data?.data, searchTerm]);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const summary = data?.summary ?? {};
  const totalExecutions = (data?.total ?? 0) || Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <div className="automation-logs-page">
      <div className="page-header-actions">
        <PageHeader
          title="AI & Automation Logs"
          subtitle="Audit trace of AI tool calls, order confirmations, and e-commerce platform mutations"
        />
        <button
          className="refresh-btn"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh logs"
          aria-label="Refresh logs"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          <span>{isFetching ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      {/* KPI Status Cards */}
      <div className="logs-summary-grid">
        <div
          className={`summary-card total ${!filters.status ? 'active' : ''}`}
          onClick={() => setFilter('status', '')}
          role="button"
          tabIndex={0}
        >
          <div className="card-header">
            <span className="card-label">Total Executions</span>
            <div className="card-icon total">
              <Layers size={18} />
            </div>
          </div>
          <strong className="card-value">{totalExecutions}</strong>
          <span className="card-hint">All recorded tool calls</span>
        </div>

        <div
          className={`summary-card succeeded ${filters.status === 'succeeded' ? 'active' : ''}`}
          onClick={() => setFilter('status', filters.status === 'succeeded' ? '' : 'succeeded')}
          role="button"
          tabIndex={0}
        >
          <div className="card-header">
            <span className="card-label">Succeeded</span>
            <div className="card-icon succeeded">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <strong className="card-value">{summary.succeeded ?? 0}</strong>
          <span className="card-hint">
            {totalExecutions > 0
              ? `${Math.round(((summary.succeeded ?? 0) / totalExecutions) * 100)}% success rate`
              : '0% rate'}
          </span>
        </div>

        <div
          className={`summary-card failed ${filters.status === 'failed' ? 'active' : ''}`}
          onClick={() => setFilter('status', filters.status === 'failed' ? '' : 'failed')}
          role="button"
          tabIndex={0}
        >
          <div className="card-header">
            <span className="card-label">Failed</span>
            <div className="card-icon failed">
              <XCircle size={18} />
            </div>
          </div>
          <strong className="card-value">{summary.failed ?? 0}</strong>
          <span className="card-hint">Rejected or errored calls</span>
        </div>

        <div
          className={`summary-card uncertain ${filters.status === 'uncertain' ? 'active' : ''}`}
          onClick={() => setFilter('status', filters.status === 'uncertain' ? '' : 'uncertain')}
          role="button"
          tabIndex={0}
        >
          <div className="card-header">
            <span className="card-label">Uncertain / Needs Check</span>
            <div className="card-icon uncertain">
              <AlertTriangle size={18} />
            </div>
          </div>
          <strong className="card-value">{summary.uncertain ?? 0}</strong>
          <span className="card-hint">Ambiguous AI response</span>
        </div>

        <div
          className={`summary-card started ${filters.status === 'started' ? 'active' : ''}`}
          onClick={() => setFilter('status', filters.status === 'started' ? '' : 'started')}
          role="button"
          tabIndex={0}
        >
          <div className="card-header">
            <span className="card-label">In Progress</span>
            <div className="card-icon started">
              <Clock size={18} />
            </div>
          </div>
          <strong className="card-value">{summary.started ?? 0}</strong>
          <span className="card-hint">Currently executing</span>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="logs-filter-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by tool, phone, ID…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
              ×
            </button>
          )}
        </div>

        <div className="filter-group">
          <select
            value={filters.status}
            onChange={e => setFilter('status', e.target.value)}
            className="filter-select"
          >
            <option value="">Status: All</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="uncertain">Uncertain</option>
            <option value="started">Started</option>
          </select>

          <select
            value={filters.provider}
            onChange={e => setFilter('provider', e.target.value)}
            className="filter-select"
          >
            <option value="">Provider: All</option>
            <option value="shopify">Shopify</option>
            <option value="woocommerce">WooCommerce</option>
            <option value="youcan">YouCan</option>
          </select>

          <input
            type="text"
            placeholder="Filter tool (e.g. confirm)"
            value={filters.tool}
            onChange={e => setFilter('tool', e.target.value)}
            className="filter-input-tool"
          />

          <div className="date-filter-wrap">
            <Calendar size={14} className="calendar-icon" />
            <input
              type="date"
              value={filters.from}
              onChange={e => setFilter('from', e.target.value)}
              title="From date"
            />
            <span className="date-sep">→</span>
            <input
              type="date"
              value={filters.to}
              onChange={e => setFilter('to', e.target.value)}
              title="To date"
            />
          </div>

          {hasActiveFilters && (
            <button className="reset-filter-btn" onClick={resetFilters} title="Reset all filters">
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Logs Table */}
      <div className="logs-table-card">
        <div className="table-meta-bar">
          <span className="result-count">
            Showing <strong>{filteredLogs.length}</strong> {filteredLogs.length === 1 ? 'execution' : 'executions'}
            {hasActiveFilters && ' (filtered)'}
          </span>
          <span className="auto-refresh-tag">Auto-refreshes every 15s</span>
        </div>

        <div className="logs-table-wrapper">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Tool / Action</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Duration</th>
                <th>Result Preview</th>
                <th className="th-action">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="table-state-cell">
                    <div className="loading-state">
                      <RefreshCw size={24} className="animate-spin text-primary" />
                      <span>Loading AI & automation activity…</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-state-cell">
                    <div className="empty-state">
                      <Bot size={40} className="empty-icon" />
                      <h4>No executions found</h4>
                      <p>
                        {hasActiveFilters
                          ? 'No automation logs match your current filter criteria.'
                          : 'No AI tool executions or mutations have been recorded yet.'}
                      </p>
                      {hasActiveFilters && (
                        <button className="reset-empty-btn" onClick={resetFilters}>
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(item => (
                  <tr
                    key={item.id}
                    className="log-row"
                    onClick={() => setSelectedExecution(item)}
                  >
                    <td className="time-cell">
                      <div className="time-primary">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="time-secondary">
                        {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </td>

                    <td className="tool-cell">
                      <div className="tool-badge">
                        <Wrench size={13} />
                        <span>{item.tool}</span>
                      </div>
                    </td>

                    <td className="provider-cell">
                      <span className={`provider-pill ${item.provider?.toLowerCase()}`}>
                        <ShoppingBag size={12} />
                        {item.provider}
                      </span>
                    </td>

                    <td className="status-cell">
                      <span className={`status-pill ${item.status}`}>
                        {item.status === 'succeeded' && <CheckCircle2 size={12} />}
                        {item.status === 'failed' && <XCircle size={12} />}
                        {item.status === 'uncertain' && <AlertTriangle size={12} />}
                        {item.status === 'started' && <Clock size={12} />}
                        <span>{item.status}</span>
                      </span>
                    </td>

                    <td className="customer-cell">
                      {item.customerPhone ? (
                        <span className="phone-tag">{item.customerPhone}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    <td className="duration-cell">
                      {item.durationMs != null ? (
                        <span className="duration-tag">{item.durationMs}ms</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    <td className="preview-cell">
                      {item.errorMessage ? (
                        <span className="error-snippet" title={item.errorMessage}>
                          {item.errorMessage}
                        </span>
                      ) : item.result ? (
                        <span className="result-snippet">
                          {JSON.stringify(item.result)}
                        </span>
                      ) : (
                        <span className="text-muted italic">In progress…</span>
                      )}
                    </td>

                    <td className="action-cell">
                      <button
                        className="view-btn"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedExecution(item);
                        }}
                        title="Inspect payload & details"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Inspection Modal */}
      {selectedExecution && (
        <Modal
          open={!!selectedExecution}
          onClose={() => setSelectedExecution(null)}
          title={
            <div className="modal-title-wrap">
              <Bot size={20} className="modal-bot-icon" />
              <span>Execution Detail : {selectedExecution.tool}</span>
              <span className={`status-pill ${selectedExecution.status} ml-auto`}>
                {selectedExecution.status}
              </span>
            </div>
          }
          className="execution-detail-modal"
        >
          <div className="modal-detail-content">
            {/* Meta Grid */}
            <div className="detail-meta-grid">
              <div className="meta-item">
                <span className="meta-label">Execution ID</span>
                <div className="meta-val-copy">
                  <code>{selectedExecution.id}</code>
                  <button
                    onClick={() => copyToClipboard(selectedExecution.id, 'id')}
                    title="Copy ID"
                    className="copy-icon-btn"
                  >
                    {copiedField === 'id' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="meta-item">
                <span className="meta-label">Provider</span>
                <span className={`provider-pill ${selectedExecution.provider?.toLowerCase()}`}>
                  {selectedExecution.provider}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Customer Phone</span>
                <span className="meta-val font-mono">
                  {selectedExecution.customerPhone ?? 'Not specified'}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Timestamp</span>
                <span className="meta-val">
                  {new Date(selectedExecution.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Duration</span>
                <span className="meta-val">
                  {selectedExecution.durationMs != null ? `${selectedExecution.durationMs} ms` : '—'}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Store ID</span>
                <span className="meta-val font-mono">{selectedExecution.storeId ?? '—'}</span>
              </div>
            </div>

            {/* Error Banner */}
            {selectedExecution.errorMessage && (
              <div className="detail-error-box">
                <div className="error-title">
                  <XCircle size={16} />
                  <strong>Execution Failure :</strong>
                </div>
                <p className="error-message">{selectedExecution.errorMessage}</p>
              </div>
            )}

            {/* Input Payload */}
            <div className="payload-section">
              <div className="payload-header">
                <strong>Input Parameters</strong>
                {selectedExecution.input && (
                  <button
                    className="copy-payload-btn"
                    onClick={() =>
                      copyToClipboard(JSON.stringify(selectedExecution.input, null, 2), 'input')
                    }
                  >
                    {copiedField === 'input' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedField === 'input' ? 'Copied' : 'Copy Input JSON'}</span>
                  </button>
                )}
              </div>
              <pre className="payload-code">
                {selectedExecution.input
                  ? JSON.stringify(selectedExecution.input, null, 2)
                  : '// No input payload parameters'}
              </pre>
            </div>

            {/* Output / Result Payload */}
            <div className="payload-section">
              <div className="payload-header">
                <strong>Output / Mutation Result</strong>
                {selectedExecution.result && (
                  <button
                    className="copy-payload-btn"
                    onClick={() =>
                      copyToClipboard(JSON.stringify(selectedExecution.result, null, 2), 'result')
                    }
                  >
                    {copiedField === 'result' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedField === 'result' ? 'Copied' : 'Copy Result JSON'}</span>
                  </button>
                )}
              </div>
              <pre className="payload-code result">
                {selectedExecution.result
                  ? JSON.stringify(selectedExecution.result, null, 2)
                  : '// No execution result recorded'}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
