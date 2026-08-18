import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { StoreStatus } from '../enum/store-status.enum';
// import { IntegrationConnection } from './integration-connection.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { Platform } from '../enum/platform.enum';
import { Session } from '../../session/entities/session.entity';

@Entity('stores')
@Index('UQ_stores_merchant_name', ['merchantId', 'name'], { unique: true })
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
  @Column({
    type: 'varchar',
  })
  provider: Platform;

  @Column({
    nullable: true,
  })
  ownerName?: string;

  @Column()
  email: string;

  @Column({
    nullable: true,
  })
  phone?: string;

  @Column({
    default: 'fr',
  })
  language: string;

  @Column({
    default: 'Africa/Casablanca',
  })
  timezone: string;

  @Column({
    default: 'MAD',
  })
  currency: string;

  @Column({
    type: 'simple-json',
    nullable: true,
  })
  settings?: Record<string, any>;

  @Column({
    type: 'varchar',
    default: StoreStatus.ACTIVE,
  })
  status: StoreStatus;

  // @OneToMany(
  //   () => IntegrationConnection,
  //   integration => integration.store,
  // )
  // integrations: IntegrationConnection[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Merchant, merchant => merchant.stores, { onDelete: 'CASCADE' })
  merchant: Merchant;

  @Column({ type: 'varchar' })
  merchantId: string;
  @OneToOne(() => Session, session => session.store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Column({ type: 'varchar', unique: true })
  sessionId: string;
}
