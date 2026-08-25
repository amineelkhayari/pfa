import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

@Entity('user_login_sessions')
export class UserLoginSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: dateColumnType(), transformer: DateTransformer })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
