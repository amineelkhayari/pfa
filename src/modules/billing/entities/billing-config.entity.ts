import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('billing_config')
export class BillingConfig {
  @PrimaryColumn({ type: 'varchar', length: 20, default: 'default' }) id: string;
  @Column({ type: 'text' }) encryptedSettings: string;
  @UpdateDateColumn() updatedAt: Date;
}
