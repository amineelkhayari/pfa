import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminBillingApi, adminUsersApi, type AccountUser } from '../services/api';
import './AdminUsers.css';

export function AdminUsers() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminUsersApi.list });
  const { data: summary } = useQuery({ queryKey: ['admin', 'users', 'summary'], queryFn: adminUsersApi.summary });
  const { data: plans = [] } = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminBillingApi.plans });
  const { data: details, isLoading: detailsLoading } = useQuery({ queryKey: ['admin', 'users', selectedId, 'details'], queryFn: () => adminUsersApi.details(selectedId!), enabled: Boolean(selectedId) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: { plan?: string; status?: 'active' | 'suspended' } }) => adminUsersApi.update(id, body), onSuccess: () => { void client.invalidateQueries({ queryKey: ['admin', 'users'] }); if (selectedId) void client.invalidateQueries({ queryKey: ['admin', 'users', selectedId, 'details'] }); } });
  const change = (user: AccountUser, body: { plan?: string; status?: 'active' | 'suspended' }) => update.mutate({ id: user.id, body });
  const meter = (label: string, used: number, limit: number) => { const percentage = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100)); return <div className="user-meter"><div><span>{label}</span><strong>{used.toLocaleString()} / {limit.toLocaleString()}</strong></div><div className="user-meter-track"><i style={{ width: `${percentage}%` }}/></div><small>{percentage}% used</small></div>; };

  return <div className="admin-users-page"><PageHeader title="User management" subtitle="Inspect customer activity, usage, subscriptions, plans, and access" />
    <div className="admin-summary">{[['Total users', summary?.total], ['Active', summary?.active], ...plans.map(plan => [plan.name, summary?.byPlan?.[plan.slug] ?? 0]), ['Suspended', summary?.suspended]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value ?? 0}</strong></div>)}</div>
    <div className="admin-users-table"><div className="admin-user-row header"><span>User</span><span>Plan</span><span>Messages</span><span>Status</span><span>Details</span></div>
      {isLoading ? <p className="admin-loading">Loading users…</p> : users.map(user => <Fragment key={user.id}><div className={`admin-user-row ${selectedId === user.id ? 'selected' : ''}`}>
        <div><strong>{user.name}</strong><small>{user.email}<br/>@{user.username}</small></div>
        {user.role === 'admin' ? <strong>Manager</strong> : <select value={user.plan ?? 'free'} disabled={update.isPending} onChange={event => change(user, { plan: event.target.value })}>{plans.map(plan => <option key={plan.id} value={plan.slug}>{plan.name} · {(plan.priceMonthly / 100).toFixed(2)} {plan.currency}</option>)}</select>}
        <small>{user.sentMessages.toLocaleString()} sent<br/>{user.receivedMessages.toLocaleString()} received</small>
        <select value={user.status} disabled={user.username === 'admin' || update.isPending} onChange={event => change(user, { status: event.target.value as 'active' | 'suspended' })}><option value="active">Active</option><option value="suspended">Suspended</option></select>
        <button className="user-details-button" onClick={() => setSelectedId(selectedId === user.id ? null : user.id)}>{selectedId === user.id ? <ChevronUp size={17}/> : <ChevronDown size={17}/>} {selectedId === user.id ? 'Close' : 'View'}</button>
      </div>{selectedId === user.id && <div className="admin-user-details">{detailsLoading || !details ? <p>Loading complete customer profile…</p> : <>
        <div className="user-detail-heading"><div><h3>{details.user.name}</h3><p>User ID: {details.user.id}</p></div><span className={`user-status ${details.user.status}`}>{details.user.status}</span></div>
        <div className="user-detail-grid"><section><h4>Account</h4><dl><div><dt>Email</dt><dd>{details.user.email}</dd></div><div><dt>Username</dt><dd>@{details.user.username}</dd></div><div><dt>Role</dt><dd>{details.user.role}</dd></div><div><dt>Created</dt><dd>{new Date(details.user.createdAt).toLocaleString()}</dd></div><div><dt>Last updated</dt><dd>{new Date(details.user.updatedAt).toLocaleString()}</dd></div><div><dt>Usage cycle began</dt><dd>{new Date(details.usagePeriodStart).toLocaleString()}</dd></div></dl></section>
          <section><h4>Connected resources</h4><div className="resource-counts"><div><strong>{details.usage.sessions}</strong><span>WhatsApp sessions</span></div><div><strong>{details.usage.stores}</strong><span>Stores</span></div><div><strong>{details.usage.products}</strong><span>Products</span></div><div><strong>{details.usage.orders}</strong><span>Orders</span></div></div></section>
          <section className="usage-section"><h4>Monthly plan usage</h4>{details.limits ? <>{meter('Sent messages', details.usage.sentMessages, details.limits.sentMessages)}{meter('Received messages', details.usage.receivedMessages, details.limits.receivedMessages)}{meter('AI context tokens', details.usage.aiTokens, details.limits.aiTokens)}{meter('Voice transcriptions (STT)', details.usage.audioTranscriptions, details.limits.audioTranscriptions)}{meter('Audio replies (TTS)', details.usage.audioReplies, details.limits.audioReplies)}{meter('WhatsApp sessions', details.usage.sessions, details.limits.sessions)}{meter('Stores', details.usage.stores, details.limits.stores)}</> : <p>Manager accounts do not consume customer plan quotas.</p>}</section>
          <section><h4>Billing subscriptions</h4>{details.subscriptions.length ? details.subscriptions.map(subscription => <div className="subscription-line" key={subscription.id}><div><strong>{subscription.provider.toUpperCase()}</strong><small>{subscription.status}</small></div><span>{subscription.currentPeriodEnd ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : 'No renewal date'}</span></div>) : <p>No payment subscription. The plan may be free or assigned manually.</p>}</section>
        </div></>}</div>}</Fragment>)}
    </div>
  </div>;
}
