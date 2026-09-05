import { Platform } from '../modules/stores/enum/platform.enum';
import { Order } from '../modules/stores/entities/order.entity';

export interface ProviderConnection { storeId: string; credentials: Record<string, any> }
export interface ProviderSyncResult { products: number; orders: number }
export interface ProviderShippingAddress { customerName: string; address1: string; city: string; postalCode?: string | null; country: string; phone?: string }
export interface ProviderCreateOrderInput extends ProviderShippingAddress { productId: string; variantId?: string | null; price: number; quantity: number }
export interface ProviderCreatedOrder { orderId: string; orderName: string | null }
export interface ProviderStoreProfile {
  externalId?: string | null;
  name: string;
  domain?: string | null;
  ownerName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string | null;
  timezone?: string | null;
  language?: string | null;
}

/** Runtime contract consumed by provider-neutral commerce and AI workflows. */
export interface IntegrationProvider {
  readonly platform: Platform;
  validate(credentials: Record<string, any>): Promise<void>;
  getStoreProfile(connection: ProviderConnection): Promise<ProviderStoreProfile>;
  getStoreKnowledge(connection: ProviderConnection): Promise<Record<string, unknown>>;
  sync(connection: ProviderConnection): Promise<ProviderSyncResult>;
  registerWebhooks(connection: ProviderConnection): Promise<number>;
  confirmOrder(connection: ProviderConnection, order: Order): Promise<void>;
  cancelOrder(connection: ProviderConnection, order: Order): Promise<void>;
  updateShippingAddress(connection: ProviderConnection, order: Order, address: ProviderShippingAddress): Promise<void>;
  createOrder(connection: ProviderConnection, input: ProviderCreateOrderInput): Promise<ProviderCreatedOrder>;
}
