import { CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('notification_reads')
@Index('UQ_notification_reads_notification_user', ['notificationId', 'userId'], { unique: true })
export class NotificationRead {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index()
  @Column({ type: 'varchar', length: 36 })
  notificationId: string;
  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;
  @CreateDateColumn() readAt: Date;
}
