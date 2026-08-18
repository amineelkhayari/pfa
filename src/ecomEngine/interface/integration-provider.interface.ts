// import { IntegrationConnection } from "../../modules/stores/entities/integration-connection.entity";

export interface IntegrationProvider {
  /**
   * Provider name
   * ex: shopify
   */
  readonly platform: string;

  /**
   * Validate provider credentials
   */
  validate(credentials: Record<string, any>): Promise<void>;

  /**
   * Register provider webhooks
   */
  registerWebhooks(connection: any): Promise<void>;

  /**
   * Synchronize products
   */
  syncProducts(connection: any): Promise<void>;

  /**
   * Synchronize orders
   */
  syncOrders(connection: any): Promise<void>;

  /**
   * Synchronize customers
   */
  syncCustomers(connection: any): Promise<void>;
}
