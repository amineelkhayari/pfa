import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('commerce_message_receipts')
@Index(['sessionId', 'messageId'], { unique: true })
export class CommerceMessageReceipt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) sessionId: string;
  @Column({ type: 'varchar', length: 255 }) messageId: string;
  @Column({ type: 'varchar', length: 20, default: 'processing' }) status: 'processing' | 'completed';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
