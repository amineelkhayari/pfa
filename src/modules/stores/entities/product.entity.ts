import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from './store.entity';

@Entity('products')
@Index(['storeId', 'externalProductId'], { unique: true })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Store that owns this product.
   */
  @Column({ type: 'varchar' })
  storeId: string;

  @ManyToOne(() => Store, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  /**
   * Product ID assigned by the connected commerce provider.
   */
  @Column({ type: 'varchar', length: 100 })
  externalProductId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  handle: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  productType: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendor: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'active',
  })
  status: string;

  /**
   * Product tags.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  tags: string[] | null;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  /**
   * Provider product variants, stored as JSON because schemas differ by platform.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  variants: Record<string, any>[] | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  price: number;

  @CreateDateColumn()
  externalCreatedAt: Date | null;

  @UpdateDateColumn()
  externalUpdatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
