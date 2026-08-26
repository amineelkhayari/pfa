import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface AiConversationTurn { role: 'customer' | 'assistant'; text: string; at: string }

@Entity('order_ai_conversations')
@Index(['orderId'], { unique: true })
export class OrderAiConversation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') orderId: string;
  @Column('uuid') storeId: string;
  @Column({ type: 'varchar', length: 40, default: 'active' }) status: string;
  @Column({ type: 'int', default: 0 }) turnCount: number;
  @Column({ type: 'simple-json', nullable: true }) turns: AiConversationTurn[] | null;
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
