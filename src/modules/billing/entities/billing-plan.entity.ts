import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export interface BillingPlanLimits {
  sessions: number; stores: number; sentMessages: number; receivedMessages: number; aiTokens: number;
}

@Entity('billing_plans')
export class BillingPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ type: 'varchar', length: 50 }) slug: string;
  @Column({ type: 'varchar', length: 80 }) name: string;
  @Column({ type: 'varchar', length: 240, default: '' }) description: string;
  @Column({ type: 'int', default: 0 }) priceMonthly: number;
  @Column({ type: 'varchar', length: 3, default: 'USD' }) currency: string;
  @Column({ type: jsonColumnType() }) limits: BillingPlanLimits;
  @Column({ type: jsonColumnType() }) features: string[];
  @Column({ type: 'int', default: 0 }) trialDays: number;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'boolean', default: false }) highlighted: boolean;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) stripePriceId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) paypalPlanId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
