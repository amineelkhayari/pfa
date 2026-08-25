import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';
export enum CampaignStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
@Entity('campaigns')
@Index(['userId', 'createdAt'])
export class Campaign {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) userId: string;
  @Column({ type: 'varchar' }) sessionId: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'text' }) message: string;
  @Column({ type: 'varchar', default: 'store_customers' }) audienceType: string;
  @Column({ type: jsonColumnType() }) recipients: string[];
  @Column({ type: jsonColumnType() }) batchIds: string[];
  @Column({ type: 'varchar', default: CampaignStatus.RUNNING }) status: CampaignStatus;
  @Column({ type: 'int', default: 0 }) riskScore: number;
  @Column({ type: 'int', default: 0 }) sent: number;
  @Column({ type: 'int', default: 0 }) failed: number;
  @Column({ type: 'int', default: 0 }) pending: number;
  @Column({ type: 'int', default: 0 }) skipped: number;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
