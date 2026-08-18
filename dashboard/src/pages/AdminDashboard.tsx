import { useQuery } from '@tanstack/react-query';
import { UsersRound, UserCheck, UserX, Send, MessageSquare } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { adminUsersApi, statsApi } from '../services/api';
import './AdminUsers.css';

export function AdminDashboard() {
  const { data: users } = useQuery({ queryKey: ['admin','users','summary'], queryFn: adminUsersApi.summary });
  const { data: stats } = useQuery({ queryKey: ['stats','overview'], queryFn: statsApi.getOverview });
  const { data: resources } = useQuery({ queryKey: ['admin','resources'], queryFn: adminUsersApi.resources });
  const cards = [
    ['Total users', users?.total ?? 0, UsersRound], ['Active users', users?.active ?? 0, UserCheck],
    ['Suspended', users?.suspended ?? 0, UserX], ['Messages sent', stats?.messages.sent ?? 0, Send],
    ['Messages received', stats?.messages.received ?? 0, MessageSquare],
  ] as const;
  return <div className="admin-users-page"><PageHeader title="Administration" subtitle="Global application totals and customer situation" />
    <div className="admin-summary">{cards.map(([label,value,Icon]) => <div key={label}><Icon size={20}/><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}</div>
    <div className="admin-summary"><div><span>Free customers</span><strong>{users?.free ?? 0}</strong></div><div><span>Pro customers</span><strong>{users?.pro ?? 0}</strong></div><div><span>Total sessions</span><strong>{resources?.sessions ?? 0}</strong></div><div><span>Active sessions</span><strong>{stats?.sessions.active ?? 0}</strong></div><div><span>Stores</span><strong>{resources?.stores ?? 0}</strong></div><div><span>Products</span><strong>{resources?.products ?? 0}</strong></div><div><span>Orders</span><strong>{resources?.orders ?? 0}</strong></div></div>
  </div>;
}
