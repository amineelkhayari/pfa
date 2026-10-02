import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminBillingApi, adminUsersApi, type AccountUser, type AdminUserDetails } from '../services/api';
import { formatBillingDate, subscriptionSchedule } from '../utils/subscriptionSchedule';
import './AdminUsers.css';

function AdminTrialSection({ details, onRefresh }: { details: AdminUserDetails; onRefresh: () => void }) {
  const [customDate, setCustomDate] = useState(() => {
    if (details.trialEndsAt) {
      const d = new Date(details.trialEndsAt);
      return !isNaN(d.getTime()) ? d.toISOString().slice(0, 16) : '';
    }
    return '';
  });
  const [resetUsage, setResetUsage] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const trialMutation = useMutation({
    mutationFn: (body: Parameters<typeof adminUsersApi.extendTrial>[1]) =>
      adminUsersApi.extendTrial(details.user.id, body),
    onSuccess: (res) => {
      setFeedback({ type: 'success', message: `Trial extended until ${new Date(res.trialEndsAt).toLocaleString()}!` });
      onRefresh();
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update trial' });
    },
  });

  if (details.user.role === 'admin') return null;

  const isExpired = details.trialExpired;

  return (
    <section className="admin-trial-card">
      <div className="trial-card-header">
        <h4>Free Trial Management</h4>
        <span className={`trial-status-badge ${isExpired ? 'expired' : 'active'}`}>
          {isExpired ? 'Trial Expired' : 'Trial Active'}
        </span>
      </div>

      <div className="trial-expiry-info">
        Current Expiration:{' '}
        <strong>
          {details.trialEndsAt ? new Date(details.trialEndsAt).toLocaleString() : 'None / Not set'}
        </strong>
      </div>

      <div className="trial-quick-buttons">
        <button
          type="button"
          className="trial-quick-btn"
          disabled={trialMutation.isPending}
          onClick={() => trialMutation.mutate({ extendHours: 1, resetUsage })}
        >
          +1 Hour
        </button>
        <button
          type="button"
          className="trial-quick-btn"
          disabled={trialMutation.isPending}
          onClick={() => trialMutation.mutate({ extendDays: 1, resetUsage })}
        >
          +1 Day
        </button>
        <button
          type="button"
          className="trial-quick-btn"
          disabled={trialMutation.isPending}
          onClick={() => trialMutation.mutate({ extendDays: 3, resetUsage })}
        >
          +3 Days
        </button>
        <button
          type="button"
          className="trial-quick-btn"
          disabled={trialMutation.isPending}
          onClick={() => trialMutation.mutate({ extendWeeks: 1, resetUsage })}
        >
          +1 Week
        </button>
        <button
          type="button"
          className="trial-quick-btn"
          disabled={trialMutation.isPending}
          onClick={() => trialMutation.mutate({ extendMonths: 1, resetUsage })}
        >
          +1 Month
        </button>
        <button
          type="button"
          className="trial-quick-btn"
          disabled={trialMutation.isPending}
          onClick={() => trialMutation.mutate({ extendYears: 1, resetUsage })}
        >
          +1 Year
        </button>
      </div>

      <div className="trial-custom-date">
        <input
          type="datetime-local"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
        />
        <button
          type="button"
          className="trial-action-btn"
          disabled={trialMutation.isPending || !customDate}
          onClick={() =>
            trialMutation.mutate({
              action: 'set_date',
              trialEndsAt: new Date(customDate).toISOString(),
              resetUsage,
            })
          }
        >
          {trialMutation.isPending ? 'Updating…' : 'Set Trial Date'}
        </button>
      </div>

      <label className="trial-reset-toggle">
        <input
          type="checkbox"
          checked={resetUsage}
          onChange={(e) => setResetUsage(e.target.checked)}
        />
        <span>Reset usage counters (messages & AI tokens) upon trial renewal</span>
      </label>

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>{feedback.message}</div>
      )}
    </section>
  );
}

function AdminQuotaSection({ details, onRefresh }: { details: AdminUserDetails; onRefresh: () => void }) {
  const currentExtra = details.extraQuota || {};
  const [sessions, setSessions] = useState(currentExtra.sessions || 0);
  const [stores, setStores] = useState(currentExtra.stores || 0);
  const [sentMessages, setSentMessages] = useState(currentExtra.sentMessages || 0);
  const [receivedMessages, setReceivedMessages] = useState(currentExtra.receivedMessages || 0);
  const [aiTokens, setAiTokens] = useState(currentExtra.aiTokens || 0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const eq = details.extraQuota || {};
    setSessions(eq.sessions || 0);
    setStores(eq.stores || 0);
    setSentMessages(eq.sentMessages || 0);
    setReceivedMessages(eq.receivedMessages || 0);
    setAiTokens(eq.aiTokens || 0);
  }, [details.extraQuota]);

  const quotaMutation = useMutation({
    mutationFn: () =>
      adminUsersApi.setExtraQuota(details.user.id, {
        sessions,
        stores,
        sentMessages,
        receivedMessages,
        aiTokens,
      }),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Extra quotas updated successfully!' });
      onRefresh();
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update extra quota' });
    },
  });

  if (details.user.role === 'admin') return null;

  const base = details.baseLimits || details.limits;

  return (
    <section className="admin-quota-card">
      <div className="quota-card-header">
        <h4>Extra Quotas & Add-ons</h4>
        <small style={{ color: 'var(--text-secondary)' }}>Added on top of base plan limits</small>
      </div>

      <div className="quota-editor-grid">
        <div className="quota-field-item">
          <label>Extra WhatsApp Sessions</label>
          <div className="quota-field-inputs">
            <input
              type="number"
              min={0}
              value={sessions}
              onChange={(e) => setSessions(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <button
              type="button"
              className="quota-bump-btn"
              onClick={() => setSessions((s) => s + 1)}
            >
              +1
            </button>
          </div>
          <div className="quota-calc-row">
            Base: {base?.sessions ?? 0} → Total: <strong>{(base?.sessions ?? 0) + sessions}</strong>
          </div>
        </div>

        <div className="quota-field-item">
          <label>Extra Connected Stores</label>
          <div className="quota-field-inputs">
            <input
              type="number"
              min={0}
              value={stores}
              onChange={(e) => setStores(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <button
              type="button"
              className="quota-bump-btn"
              onClick={() => setStores((s) => s + 1)}
            >
              +1
            </button>
          </div>
          <div className="quota-calc-row">
            Base: {base?.stores ?? 0} → Total: <strong>{(base?.stores ?? 0) + stores}</strong>
          </div>
        </div>

        <div className="quota-field-item">
          <label>Extra Sent Messages</label>
          <div className="quota-field-inputs">
            <input
              type="number"
              min={0}
              step={100}
              value={sentMessages}
              onChange={(e) => setSentMessages(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <button
              type="button"
              className="quota-bump-btn"
              onClick={() => setSentMessages((m) => m + 1000)}
            >
              +1k
            </button>
          </div>
          <div className="quota-calc-row">
            Base: {(base?.sentMessages ?? 0).toLocaleString()} → Total:{' '}
            <strong>{((base?.sentMessages ?? 0) + sentMessages).toLocaleString()}</strong>
          </div>
        </div>

        <div className="quota-field-item">
          <label>Extra AI Tokens</label>
          <div className="quota-field-inputs">
            <input
              type="number"
              min={0}
              step={10000}
              value={aiTokens}
              onChange={(e) => setAiTokens(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <button
              type="button"
              className="quota-bump-btn"
              onClick={() => setAiTokens((t) => t + 50000)}
            >
              +50k
            </button>
          </div>
          <div className="quota-calc-row">
            Base: {(base?.aiTokens ?? 0).toLocaleString()} → Total:{' '}
            <strong>{((base?.aiTokens ?? 0) + aiTokens).toLocaleString()}</strong>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="quota-save-btn"
        disabled={quotaMutation.isPending}
        onClick={() => quotaMutation.mutate()}
      >
        {quotaMutation.isPending ? 'Saving Quotas…' : 'Save Extra Quotas'}
      </button>

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>{feedback.message}</div>
      )}
    </section>
  );
}

export function AdminUsers() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminUsersApi.list });
  const { data: plans = [] } = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminBillingApi.plans });
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['admin', 'users', selectedId, 'details'],
    queryFn: () => adminUsersApi.details(selectedId!),
    enabled: Boolean(selectedId),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { plan?: string; status?: 'active' | 'suspended' } }) =>
      adminUsersApi.update(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });
      if (selectedId) void client.invalidateQueries({ queryKey: ['admin', 'users', selectedId, 'details'] });
    },
  });
  const change = (user: AccountUser, body: { plan?: string; status?: 'active' | 'suspended' }) =>
    update.mutate({ id: user.id, body });
  const meter = (label: string, used: number, limit: number) => {
    const percentage = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
    return (
      <div className="user-meter">
        <div><span>{label}</span><strong>{used.toLocaleString()} / {limit.toLocaleString()}</strong></div>
        <div className="user-meter-track"><i style={{ width: `${percentage}%` }}/></div>
        <small>{percentage}% used</small>
      </div>
    );
  };

  const refreshDetails = () => {
    if (selectedId) {
      void client.invalidateQueries({ queryKey: ['admin', 'users', selectedId, 'details'] });
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });
    }
  };

  return (
    <div className="admin-users-page">
      <PageHeader title="User management" subtitle="Inspect customer activity, usage, subscriptions, plans, and access" />
      <div className="admin-users-table">
        <div className="admin-user-row header"><span>User</span><span>Plan</span><span>Messages</span><span>Status</span><span>Details</span></div>
        {isLoading ? (
          <p className="admin-loading">Loading users…</p>
        ) : (
          users.map((user) => (
            <Fragment key={user.id}>
              <div className={`admin-user-row ${selectedId === user.id ? 'selected' : ''}`}>
                <div><strong>{user.name}</strong><small>{user.email}<br/>@{user.username}</small></div>
                {user.role === 'admin' ? (
                  <strong>Manager</strong>
                ) : (
                  <select
                    value={user.plan ?? 'free'}
                    disabled={update.isPending}
                    onChange={(event) => change(user, { plan: event.target.value })}
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.slug}>{plan.name} · {(plan.priceMonthly / 100).toFixed(2)} {plan.currency}</option>
                    ))}
                  </select>
                )}
                <small>{user.sentMessages.toLocaleString()} sent<br/>{user.receivedMessages.toLocaleString()} received</small>
                <select
                  value={user.status}
                  disabled={user.username === 'admin' || update.isPending}
                  onChange={(event) => change(user, { status: event.target.value as 'active' | 'suspended' })}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
                <button
                  className="user-details-button"
                  onClick={() => setSelectedId(selectedId === user.id ? null : user.id)}
                >
                  {selectedId === user.id ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}{' '}
                  {selectedId === user.id ? 'Close' : 'View'}
                </button>
              </div>
              {selectedId === user.id && (
                <div className="admin-user-details">
                  {detailsLoading || !details ? (
                    <p>Loading complete customer profile…</p>
                  ) : (
                    <>
                      <div className="user-detail-heading">
                        <div><h3>{details.user.name}</h3><p>User ID: {details.user.id}</p></div>
                        <span className={`user-status ${details.user.status}`}>{details.user.status}</span>
                      </div>
                      <div className="user-detail-grid">
                        <section>
                          <h4>Account</h4>
                          <dl>
                            <div><dt>Email</dt><dd>{details.user.email}</dd></div>
                            <div><dt>Username</dt><dd>@{details.user.username}</dd></div>
                            <div><dt>Role</dt><dd>{details.user.role}</dd></div>
                            <div><dt>Created</dt><dd>{new Date(details.user.createdAt).toLocaleString()}</dd></div>
                            <div><dt>Last updated</dt><dd>{new Date(details.user.updatedAt).toLocaleString()}</dd></div>
                            <div><dt>Usage cycle began</dt><dd>{new Date(details.usagePeriodStart).toLocaleString()}</dd></div>
                          </dl>
                        </section>
                        <section>
                          <h4>Connected resources</h4>
                          <div className="resource-counts">
                            <div><strong>{details.usage.sessions}</strong><span>WhatsApp sessions</span></div>
                            <div><strong>{details.usage.stores}</strong><span>Stores</span></div>
                            <div><strong>{details.usage.products}</strong><span>Products</span></div>
                            <div><strong>{details.usage.orders}</strong><span>Orders</span></div>
                          </div>
                        </section>
                        <section className="usage-section">
                          <h4>Monthly plan usage</h4>
                          {details.limits ? (
                            <>
                              {meter('Sent messages', details.usage.sentMessages, details.limits.sentMessages)}
                              {meter('Received messages', details.usage.receivedMessages, details.limits.receivedMessages)}
                              {meter('AI context tokens', details.usage.aiTokens, details.limits.aiTokens)}
                              {meter('Voice transcriptions (STT)', details.usage.audioTranscriptions, details.limits.audioTranscriptions)}
                              {meter('Audio replies (TTS)', details.usage.audioReplies, details.limits.audioReplies)}
                              {meter('WhatsApp sessions', details.usage.sessions, details.limits.sessions)}
                              {meter('Stores', details.usage.stores, details.limits.stores)}
                            </>
                          ) : (
                            <p>Manager accounts do not consume customer plan quotas.</p>
                          )}
                        </section>
                        <section>
                          <h4>Billing subscriptions</h4>
                          {details.subscriptions.length ? (
                            details.subscriptions.map((subscription) => {
                              const schedule = subscriptionSchedule(subscription);
                              return (
                                <div className="subscription-line" key={subscription.id}>
                                  <div>
                                    <strong>{subscription.provider.toUpperCase()} · {subscription.planSlug}</strong>
                                    <small>{subscription.status} · {schedule.autoRenew ? 'auto-renew on' : 'auto-renew off'}</small>
                                    {subscription.pendingPlanSlug && <small>Change to {subscription.pendingPlanSlug}: {subscription.planChangeStatus.replaceAll('_', ' ')}</small>}
                                    {subscription.planChangeError && <small className="billing-error">{subscription.planChangeError}</small>}
                                  </div>
                                  <div className="subscription-renewal">
                                    <small>{subscription.pendingPlanSlug ? 'Change effective' : schedule.label}</small>
                                    <strong>{formatBillingDate(subscription.pendingPlanSlug ? subscription.planChangeEffectiveAt : schedule.date)}</strong>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p>No payment subscription. The plan may be free or assigned manually.</p>
                          )}
                        </section>
                        <AdminTrialSection details={details} onRefresh={refreshDetails} />
                        <AdminQuotaSection details={details} onRefresh={refreshDetails} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}
