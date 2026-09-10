import { useQuery } from '@tanstack/react-query';
import { UsersRound, UserCheck, UserX, Send, MessageSquare, Store, Package, ShoppingCart, Smartphone, CreditCard, CircleDollarSign } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminBillingApi, adminUsersApi, statsApi } from '../services/api';
import './AdminUsers.css';

export function AdminDashboard() {
  const { data: users } = useQuery({ queryKey: ['admin','users','summary'], queryFn: adminUsersApi.summary });
  const { data: stats } = useQuery({ queryKey: ['stats','overview'], queryFn: statsApi.getOverview });
  const { data: resources } = useQuery({ queryKey: ['admin','resources'], queryFn: adminUsersApi.resources });
  const { data: plans = [] } = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminBillingApi.plans });
  const { data: billing } = useQuery({ queryKey: ['admin', 'billing-history', 'dashboard'], queryFn: () => adminBillingApi.history({ limit: 1 }) });
  const earnings = billing?.summary.earnings.map(item => new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency }).format(item.amount / 100)).join(' · ') || '$0.00';
  const cards = [
    ['Total users', users?.total ?? 0, UsersRound], ['Active users', users?.active ?? 0, UserCheck],
    ['Suspended', users?.suspended ?? 0, UserX], ['Messages sent', stats?.messages.sent ?? 0, Send],
    ['Messages received', stats?.messages.received ?? 0, MessageSquare],
  ] as const;
  return <div className="admin-users-page"><PageHeader title="Administration" subtitle="Global application totals and customer situation" />
    <div className="admin-summary">{cards.map(([label,value,Icon]) => <div key={label}><Icon size={20}/><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}</div>
    <h2 className="admin-dashboard-section-title">Plans and revenue</h2>
    <div className="admin-summary">{plans.map(plan => <div key={plan.id}><CreditCard size={20}/><span>{plan.name} customers</span><strong>{users?.byPlan?.[plan.slug] ?? 0}</strong></div>)}<div><CircleDollarSign size={20}/><span>Net earnings</span><strong>{earnings}</strong></div><div><UserCheck size={20}/><span>Active subscribers</span><strong>{billing?.summary.activeSubscribers ?? 0}</strong></div><div><CreditCard size={20}/><span>Successful payments</span><strong>{billing?.summary.successful ?? 0}</strong></div><div><UserX size={20}/><span>Failed payments</span><strong>{billing?.summary.failed ?? 0}</strong></div></div>
    <h2 className="admin-dashboard-section-title">Platform resources</h2>
    <div className="admin-summary"><div><Smartphone size={20}/><span>Total sessions</span><strong>{resources?.sessions ?? 0}</strong></div><div><UserCheck size={20}/><span>Active sessions</span><strong>{stats?.sessions.active ?? 0}</strong></div><div><Store size={20}/><span>Stores</span><strong>{resources?.stores ?? 0}</strong></div><div><Package size={20}/><span>Products</span><strong>{resources?.products ?? 0}</strong></div><div><ShoppingCart size={20}/><span>Orders</span><strong>{resources?.orders ?? 0}</strong></div></div>
  </div>;
}
