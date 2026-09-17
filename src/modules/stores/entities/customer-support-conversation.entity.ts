import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

@Entity('customer_support_conversations')
@Index(['sessionId', 'chatId'], { unique: true })
export class CustomerSupportConversation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 64 }) sessionId: string;
  @Column({ type: 'varchar', length: 100 }) chatId: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) phone: string | null;
  @Column({ type: 'varchar', length: 20, default: 'ai' }) mode: 'ai' | 'human';
  @Column({ type: 'varchar', length: 20, default: 'open' }) issueStatus: 'open' | 'resolved';
  @Column({ type: 'text', nullable: true }) issueSummary: string | null;
  @Column({ type: 'varchar', length: 20, default: 'normal' }) priority: 'low' | 'normal' | 'high' | 'urgent';
  @Column({ type: 'simple-json', nullable: true }) tags: string[] | null;
  @Column({ type: 'varchar', nullable: true }) assignedUserId: string | null;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) assignedAt: Date | null;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) lastHumanMessageAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
