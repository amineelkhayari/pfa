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
@Index(['storeId', 'shopifyProductId'], { unique: true })
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
   * Shopify product ID.
   */
  @Column({ type: 'varchar', length: 100 })
  shopifyProductId: string;

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
   * Shopify product variants.
   *
   * Stored as JSON because Shopify's variant structure
   * can contain multiple fields.
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
  shopifyCreatedAt: Date | null;

  @UpdateDateColumn()
  shopifyUpdatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
