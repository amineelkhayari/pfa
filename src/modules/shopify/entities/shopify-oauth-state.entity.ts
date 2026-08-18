import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

@Entity('shopify_oauth_states')
export class ShopifyOAuthState {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  stateHash: string;

  @Column({ type: 'varchar' })
  storeId: string;

  @Column({ type: dateColumnType(), transformer: DateTransformer })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
