import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';

import { Store } from '../../stores/entities/store.entity';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

@Entity('orders')
@Index(['storeId', 'shopifyOrderId'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Store that owns this order.
   */
  @Column({ type: 'varchar' })
  storeId: string;

  @ManyToOne(() => Store, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  /**
   * Shopify order ID.
   */
  @Column({ type: 'varchar', length: 100 })
  shopifyOrderId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  orderNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalPrice: number;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'USD',
  })
  currency: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  financialStatus: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  fulfillmentStatus: string | null;

  /**
   * Shopify order line items.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  lineItems: Record<string, any>[] | null;

  /**
   * Shipping address from Shopify.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  shippingAddress: Record<string, any> | null;

  /**
   * Shopify customer object.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  customer: Record<string, any> | null;

  /**
   * Shopify order tags.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  tags: string[] | null;

  /**
   * Internal order status.
   *
   * Example:
   * open
   * confirmed
   * cancelled
   * completed
   */
  @Column({
    type: 'varchar',
    length: 50,
    default: 'open',
  })
  status: string;

  @Column({ type: 'varchar', length: 50, default: 'not_sent' })
  confirmationStatus: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  whatsappMessageId: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  confirmationSentAt: Date | null;

  @Column({ type: 'text', nullable: true })
  confirmationError: string | null;

  /**
   * Original Shopify creation date.
   */
  @CreateDateColumn()
  shopifyCreatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
