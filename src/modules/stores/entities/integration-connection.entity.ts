// import {
//   Entity,
//   PrimaryGeneratedColumn,
//   Column,
//   ManyToOne,
//   JoinColumn,
//   CreateDateColumn,
// } from 'typeorm';

// import { Store } from './store.entity';
// import { Platform } from '../enum/platform.enum';
// import { StoreStatus } from '../enum/store-status.enum';

// @Entity('integration_connections')
// export class IntegrationConnection {

//   @PrimaryGeneratedColumn('uuid')
//   id: string;

//   @ManyToOne(() => Store, store => store.integrations, {
//     onDelete: 'CASCADE',
//   })
//   @JoinColumn({ name: 'storeId' })
//   store: Store;

//   @Column()
//   storeId: string;

//   @Column({
//     type: 'varchar',
//   })
//   provider: Platform;

//   @Column({
//     nullable: true,
//   })
//   externalStoreId?: string;

//   @Column({
//     type: 'simple-json',
//     nullable: true,
//     select: false,
//   })
//   credentials?: Record<string, any>;

//   @Column({
//     type: 'simple-json',
//     nullable: true,
//   })
//   configuration?: Record<string, any>;

//   @Column({
//     type: 'simple-json',
//     nullable: true,
//   })
//   metadata?: Record<string, any>;

//   @Column({
//     type: 'varchar',
//     default: StoreStatus.ACTIVE,
//   })
//   status: StoreStatus;

//   @CreateDateColumn()
//   connectedAt: Date;
// }
