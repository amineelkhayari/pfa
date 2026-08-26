import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface AiConversationTurn { role: 'customer' | 'assistant'; text: string; at: string }
export interface PendingOrderEdit { customerName: string; address1: string; city: string; postalCode?: string; country: string; phone?: string }

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
  @Column({ type: 'varchar', length: 40, nullable: true }) pendingAction: string | null;
  @Column({ type: 'simple-json', nullable: true }) pendingData: PendingOrderEdit | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
