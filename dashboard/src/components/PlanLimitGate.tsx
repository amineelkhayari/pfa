import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAccountUsageQuery } from '../hooks/queries';
import type { AccountUsage } from '../services/api';
import './PlanLimitGate.css';

type Quota = keyof AccountUsage['limits'];

export function planLimitReason(usage: AccountUsage | undefined, quota?: Quota): string | null {
  if (!usage) return null;
  const extraForQuota = quota ? Number((usage.extraQuota as any)?.[quota] || 0) : 0;
  if (quota && usage.usage[quota] >= usage.limits[quota]) {
    const labels: Record<Quota, string> = { sessions: 'WhatsApp session', stores: 'connected store', sentMessages: 'sent message', receivedMessages: 'received message', aiTokens: 'AI context token', audioTranscriptions: 'voice transcription', audioReplies: 'audio reply' };
    return `Your ${usage.plan} ${labels[quota]} allowance has been reached.`;
  }
  if (quota && extraForQuota > 0 && usage.usage[quota] < usage.limits[quota]) {
    return null;
  }
  if (usage.plan === 'free' && usage.trialExpired) {
    if (quota && extraForQuota > 0) return null;
    return 'Your one-time free trial has expired.';
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
  return (
    <div className={`plan-limit-notice ${compact ? 'compact' : ''}`}>
      <LockKeyhole size={18} />
      <span>
        <strong>{isPaid ? 'Limit reached' : 'Upgrade required'}</strong>
        <small>
          {reason}{' '}
          {isPaid
            ? 'Purchase extra quota (+1 session or store) or upgrade your plan to continue.'
            : 'Upgrade to Pro or contact support to continue.'}
        </small>
      </span>
      <button type="button" onClick={() => navigate(isPaid ? '/account#addons' : '/account')}>
        {isPaid ? 'Buy extra quota' : 'View plans'} <ArrowUpRight size={15} />
      </button>
    </div>
  );
}
