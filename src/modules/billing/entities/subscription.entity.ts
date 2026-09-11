import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum BillingProvider { STRIPE = 'stripe', PAYPAL = 'paypal' }
export enum PlanChangeStatus { NONE = 'none', PENDING_PAYMENT = 'pending_payment', PENDING_APPROVAL = 'pending_approval', SCHEDULED = 'scheduled', COMPLETED = 'completed', FAILED = 'failed' }

@Entity('billing_subscriptions')
@Index(['provider', 'providerSubscriptionId'], { unique: true })
export class BillingSubscription {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') userId: string;
  @Column({ type: 'varchar', length: 20 }) provider: BillingProvider;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerCustomerId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerSubscriptionId: string | null;
  @Column({ type: 'varchar', length: 40, default: 'pending' }) status: string;
  @Column({ type: 'varchar', length: 50, default: 'pro' }) planSlug: string;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) currentPeriodEnd: Date | null;
  @Column({ type: 'boolean', default: false }) cancelAtPeriodEnd: boolean;
  @Column({ type: 'varchar', length: 30, default: PlanChangeStatus.NONE }) planChangeStatus: PlanChangeStatus;
  @Column({ type: 'varchar', length: 50, nullable: true }) pendingPlanSlug: string | null;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) planChangeEffectiveAt: Date | null;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) planChangeRequestedAt: Date | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerScheduleId: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) planChangeError: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
