import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum BillingProvider { STRIPE = 'stripe', PAYPAL = 'paypal' }

@Entity('billing_subscriptions')
@Index(['provider', 'providerSubscriptionId'], { unique: true })
export class BillingSubscription {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') userId: string;
  @Column({ type: 'varchar', length: 20 }) provider: BillingProvider;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerCustomerId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerSubscriptionId: string | null;
  @Column({ type: 'varchar', length: 40, default: 'pending' }) status: string;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) currentPeriodEnd: Date | null;
  @Column({ type: 'boolean', default: false }) cancelAtPeriodEnd: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
