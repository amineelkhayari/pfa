import { Check, Sparkles } from 'lucide-react';
import type { BillingPlan } from '../services/api';

export function PricingPlans({ plans, currentPlan, busy, onSelect }: { plans: BillingPlan[]; currentPlan?: string | null; busy?: boolean; onSelect: (plan: BillingPlan, provider: 'stripe' | 'paypal') => void }) {
  return <section className="pricing-section">
    <div className="pricing-heading"><span>Plans & pricing</span><h2>Choose the plan that fits your business</h2><p>Start small, then move up as your WhatsApp commerce operation grows.</p></div>
    <div className="pricing-grid">{plans.map(plan => {
      const current = currentPlan === plan.slug;
      return <article className={`pricing-card ${plan.highlighted ? 'featured' : ''}`} key={plan.id}>
        {plan.highlighted && <div className="pricing-popular"><Sparkles size={14}/> Most popular</div>}
        <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
        <div className="pricing-price"><strong>{new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency, maximumFractionDigits: 2 }).format(plan.priceMonthly / 100)}</strong><span>{plan.priceMonthly ? '/ month' : plan.trialDays ? `for ${plan.trialDays}-day trial` : 'forever'}</span></div>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={16}/><span>{feature}</span></li>)}</ul>
        <div className="pricing-capacity"><span>{plan.limits.sessions} sessions</span><span>{plan.limits.stores} stores</span><span>{plan.limits.sentMessages.toLocaleString()} sent messages</span><span>{plan.limits.aiTokens.toLocaleString()} AI tokens</span></div>
        {current ? <button disabled className="pricing-current">Your current plan</button> : plan.priceMonthly > 0 ? <div className="pricing-payments"><button disabled={busy} onClick={() => onSelect(plan, 'stripe')}>Choose with Stripe</button><button disabled={busy} onClick={() => onSelect(plan, 'paypal')}>PayPal</button></div> : <button disabled className="pricing-current">Included at signup</button>}
      </article>;
    })}</div>
  </section>;
}
