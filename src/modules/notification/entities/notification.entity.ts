import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum NotificationKind {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  /** Null means the announcement is visible to every customer account. */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId: string | null;
  @Index()
  @Column({ type: 'varchar', length: 80 })
  eventType: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  dedupeKey: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) entityId: string | null;
  @Column({ type: 'varchar', length: 160 }) title: string;
  @Column({ type: 'text' }) message: string;
  @Column({ type: 'varchar', length: 20, default: NotificationKind.INFO }) kind: NotificationKind;
  @Column({ type: 'varchar', length: 500, nullable: true }) link: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer }) expiresAt: Date | null;
  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
