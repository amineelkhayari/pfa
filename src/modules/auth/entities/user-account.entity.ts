import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiKeyRole } from './api-key.entity';

export enum UserPlan {
  FREE = 'free',
  PRO = 'pro',
}

@Entity('user_accounts')
export class UserAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  username: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, default: ApiKeyRole.OPERATOR })
  role: ApiKeyRole;

  @Column({ type: 'varchar', length: 20, nullable: true, default: UserPlan.FREE })
  plan: UserPlan | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ type: 'simple-json', nullable: true })
  settings: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  sentMessages: number;

  @Column({ type: 'int', default: 0 })
  receivedMessages: number;

  @Column({ type: 'datetime' })
  usagePeriodStart: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
