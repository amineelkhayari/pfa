import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAccountUsageQuery } from '../hooks/queries';
import type { AccountUsage } from '../services/api';
import './PlanLimitGate.css';

type Quota = keyof AccountUsage['limits'];

export function planLimitReason(usage: AccountUsage | undefined, quota?: Quota): string | null {
  if (!usage) return null;
  if (usage.plan === 'free' && usage.trialExpired) return 'Your one-time free trial has expired.';
  if (quota && usage.usage[quota] >= usage.limits[quota]) {
    const labels: Record<Quota, string> = { sessions: 'WhatsApp session', stores: 'connected store', sentMessages: 'sent message', receivedMessages: 'received message', aiTokens: 'AI context token', audioTranscriptions: 'voice transcription', audioReplies: 'audio reply' };
    return `Your ${usage.plan} ${labels[quota]} allowance has been reached.`;
  }
  return null;
}

export function usePlanLimit(quota?: Quota) {
  const query = useAccountUsageQuery();
  const reason = planLimitReason(query.data, quota);
  return { ...query, reason, blocked: Boolean(reason) };
}

export function PlanUpgradeNotice({ reason, compact = false }: { reason: string; compact?: boolean }) {
  const navigate = useNavigate();
  const usage = useAccountUsageQuery();
  const isPaid = Boolean(usage.data?.plan && usage.data.plan !== 'free');
  return <div className={`plan-limit-notice ${compact ? 'compact' : ''}`}><LockKeyhole size={18}/><span><strong>{isPaid ? 'Plan limit reached' : 'Upgrade required'}</strong><small>{reason} {isPaid ? 'Choose a higher plan or manage your subscription.' : 'Choose a paid plan to continue.'}</small></span><button type="button" onClick={() => navigate('/account')}>{isPaid ? 'Manage plan' : 'View plans'} <ArrowUpRight size={15}/></button></div>;
}
