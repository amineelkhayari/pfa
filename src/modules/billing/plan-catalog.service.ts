import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { BillingPlan, BillingPlanLimits } from './entities/billing-plan.entity';

export type PlanInput = Pick<BillingPlan, 'slug' | 'name' | 'description' | 'priceMonthly' | 'currency' | 'limits' | 'features' | 'trialDays' | 'active' | 'highlighted' | 'sortOrder'> & Partial<Pick<BillingPlan, 'stripePriceId' | 'paypalPlanId'>>;

@Injectable()
export class PlanCatalogService implements OnModuleInit {
  private plans = new Map<string, BillingPlan>();
  constructor(@InjectRepository(BillingPlan, 'data') private readonly repo: Repository<BillingPlan>) {}

  async onModuleInit() { await this.seed(); await this.reload(); }
  list(includeInactive = false) { return [...this.plans.values()].filter(p => includeInactive || p.active).sort((a, b) => a.sortOrder - b.sortOrder || a.priceMonthly - b.priceMonthly); }
  get(slug?: string | null) { return this.plans.get(slug || 'free') ?? this.plans.get('free')!; }
  require(slug: string) { const plan = this.plans.get(slug); if (!plan || !plan.active) throw new NotFoundException('Plan not found or unavailable'); return plan; }

  async create(input: PlanInput) {
    input = this.normalize(input);
    const slug = this.slug(input.slug);
    if (this.plans.has(slug)) throw new BadRequestException('A plan with this slug already exists');
    const saved = await this.repo.save(this.repo.create({ ...input, id: randomUUID(), slug, currency: input.currency.toUpperCase(), stripePriceId: input.stripePriceId || null, paypalPlanId: input.paypalPlanId || null }));
    await this.reload(); return saved;
  }
  async update(id: string, input: Partial<PlanInput>) {
    const row = await this.repo.findOneBy({ id }); if (!row) throw new NotFoundException('Plan not found');
    if (input.slug && row.slug === 'free' && this.slug(input.slug) !== 'free') throw new BadRequestException('The default free plan slug cannot be changed');
    const normalized = this.normalize({ ...row, ...input } as PlanInput);
    Object.assign(row, normalized, input.slug ? { slug: this.slug(input.slug) } : {}, input.currency ? { currency: input.currency.toUpperCase() } : {});
    const saved = await this.repo.save(row); await this.reload(); return saved;
  }
  async remove(id: string) {
    const row = await this.repo.findOneBy({ id }); if (!row) throw new NotFoundException('Plan not found');
    if (['free', 'pro'].includes(row.slug)) throw new BadRequestException('Default plans can be disabled but not deleted');
    await this.repo.remove(row); await this.reload(); return { deleted: true };
  }
  private async reload() { this.plans = new Map((await this.repo.find()).map(plan => [plan.slug, plan])); }
  private normalize<T extends PlanInput>(input: T): T {
    const integer = (value: number) => Math.max(0, Math.round(Number(value) || 0));
    return { ...input, priceMonthly: integer(input.priceMonthly), trialDays: integer(input.trialDays), sortOrder: Math.round(Number(input.sortOrder) || 0), limits: { sessions: integer(input.limits.sessions), stores: integer(input.limits.stores), sentMessages: integer(input.limits.sentMessages), receivedMessages: integer(input.limits.receivedMessages), aiTokens: integer(input.limits.aiTokens) } };
  }
  private slug(value: string) { const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!slug) throw new BadRequestException('Plan slug is required'); return slug; }
  private async seed() {
    const limits = (sessions: number, stores: number, sentMessages: number, receivedMessages: number, aiTokens: number): BillingPlanLimits => ({ sessions, stores, sentMessages, receivedMessages, aiTokens });
    if (!await this.repo.findOneBy({ slug: 'free' })) await this.repo.save(this.repo.create({ id: randomUUID(), slug: 'free', name: 'Free', description: 'Try the essential WhatsApp commerce tools.', priceMonthly: 0, currency: 'USD', limits: limits(1, 1, 20, 20, 5000), features: ['1 WhatsApp session', '1 connected store', 'AI order assistant', 'Basic customer messaging'], trialDays: 1, active: true, highlighted: false, sortOrder: 0 }));
    if (!await this.repo.findOneBy({ slug: 'pro' })) await this.repo.save(this.repo.create({ id: randomUUID(), slug: 'pro', name: 'Pro', description: 'More capacity for growing commerce teams.', priceMonthly: 500, currency: 'USD', limits: limits(5, 5, 1250, 1250, 100000), features: ['5 WhatsApp sessions', '5 connected stores', 'AI commerce agent', 'Campaigns and automation', 'Priority usage limits'], trialDays: 0, active: true, highlighted: true, sortOrder: 10 }));
  }
}
