import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from './order.entity';
import { Product } from './product.entity';
import { Store } from './store.entity';

@Entity('product_reviews')
@Index(['orderId', 'externalProductId', 'customerPhone'], { unique: true })
export class ProductReview {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) storeId: string;
  @ManyToOne(() => Store, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'storeId' }) store: Store;
  @Column({ type: 'varchar' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'orderId' }) order: Order;
  @Column({ type: 'varchar', nullable: true }) productId: string | null;
  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'productId' }) product: Product | null;
  @Column({ type: 'varchar', length: 100 }) externalProductId: string;
  @Column({ type: 'varchar', length: 255 }) productName: string;
  @Column({ type: 'varchar', length: 50 }) customerPhone: string;
  @Column({ type: 'int' }) rating: number;
  @Column({ type: 'varchar', length: 1000, nullable: true }) comment: string | null;
  @Column({ type: 'varchar', length: 30, default: 'published' }) status: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) providerReviewId: string | null;
  @CreateDateColumn() createdAt: Date;
}
