import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export type CommerceExecutionStatus = 'started' | 'succeeded' | 'failed' | 'uncertain';

@Entity('commerce_tool_executions')
@Index(['operationKey'], { unique: true })
@Index(['storeId', 'createdAt'])
export class CommerceToolExecution {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 255 }) operationKey: string;
  @Column({ type: 'varchar' }) storeId: string;
  @Column({ type: 'varchar', nullable: true }) sessionId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) messageId: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) customerPhone: string | null;
  @Column({ type: 'varchar', nullable: true }) orderId: string | null;
  @Column({ type: 'varchar', length: 50 }) provider: string;
  @Column({ type: 'varchar', length: 80 }) tool: string;
  @Column({ type: 'varchar', length: 20, default: 'started' }) status: CommerceExecutionStatus;
  @Column({ type: jsonColumnType(), nullable: true }) input: Record<string, unknown> | null;
  @Column({ type: jsonColumnType(), nullable: true }) result: Record<string, unknown> | null;
  @Column({ type: 'text', nullable: true }) errorMessage: string | null;
  @Column({ type: 'int', nullable: true }) durationMs: number | null;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
