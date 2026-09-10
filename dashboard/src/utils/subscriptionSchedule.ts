import type { BillingSubscription } from '../services/api';

export type SubscriptionSchedule = {
  label: 'Next renewal' | 'Trial ends' | 'Access ends' | 'Billing date';
  date: string | null;
  autoRenew: boolean;
};

export function subscriptionSchedule(subscription: BillingSubscription): SubscriptionSchedule {
  const status = subscription.status.toLowerCase();
  const ending = subscription.cancelAtPeriodEnd || ['cancelled', 'canceled', 'expired'].includes(status);

  return {
    label: ending ? 'Access ends' : status === 'trialing' ? 'Trial ends' : status === 'active' ? 'Next renewal' : 'Billing date',
    date: subscription.currentPeriodEnd,
    autoRenew: status === 'active' && !subscription.cancelAtPeriodEnd,
  };
}

export function formatBillingDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
