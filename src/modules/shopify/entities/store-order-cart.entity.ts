import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('store_order_carts')
@Index(['storeId', 'phone'], { unique: true })
export class StoreOrderCart {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') storeId: string;
  @Column({ type: 'varchar', length: 40 }) phone: string;
  @Column({ type: 'varchar', length: 40, default: 'product' }) step: string;
  @Column({ type: 'varchar', nullable: true }) productId: string | null;
  @Column({ type: 'varchar', nullable: true }) variantId: string | null;
  @Column({ type: 'varchar', nullable: true }) variantTitle: string | null;
  @Column({ type: 'int', default: 1 }) quantity: number;
  @Column({ type: 'varchar', nullable: true }) customerName: string | null;
  @Column({ type: 'text', nullable: true }) address1: string | null;
  @Column({ type: 'varchar', nullable: true }) city: string | null;
  @Column({ type: 'varchar', nullable: true }) postalCode: string | null;
  @Column({ type: 'varchar', default: 'Morocco' }) country: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
