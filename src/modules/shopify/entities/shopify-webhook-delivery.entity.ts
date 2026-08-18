import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('shopify_webhook_deliveries')
export class ShopifyWebhookDelivery {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  webhookId: string;

  @Column({ type: 'varchar', nullable: true })
  storeId: string | null;

  @Column({ type: 'varchar', length: 100 })
  topic: string;

  @Column({ type: 'varchar', length: 30, default: 'processing' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'integer', default: 1 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
