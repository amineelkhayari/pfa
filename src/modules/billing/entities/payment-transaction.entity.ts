import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { BillingProvider } from './subscription.entity';
import { randomUUID } from 'crypto';

export enum PaymentStatus {
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  PENDING = 'pending',
  REFUNDED = 'refunded',
}

@Entity('payment_transactions')
@Index(['provider', 'providerEventId'], { unique: true })
export class PaymentTransaction {
  // The table is created by a cross-database migration. Generate client-side as
  // well so an already-migrated PostgreSQL table without a UUID default remains safe.
  @PrimaryGeneratedColumn('uuid') id: string = randomUUID();
  @Index() @Column('uuid') userId: string;
  @Column({ type: 'varchar', length: 20 }) provider: BillingProvider;
  @Column({ type: 'varchar', length: 255 }) providerEventId: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerPaymentId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) providerSubscriptionId: string | null;
  @Index() @Column('uuid', { nullable: true }) parentTransactionId: string | null;
  @Column({ type: 'varchar', length: 30 }) status: PaymentStatus;
  @Column({ type: 'int', default: 0 }) amount: number;
  @Column({ type: 'varchar', length: 3, default: 'USD' }) currency: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) description: string | null;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) paidAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
