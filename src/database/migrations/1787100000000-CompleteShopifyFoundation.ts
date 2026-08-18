import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteShopifyFoundation1787100000000 implements MigrationInterface {
  name = 'CompleteShopifyFoundation1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.dataSource.options.type === 'postgres';
    const timestamp = postgres ? 'timestamp' : 'datetime';
    const now = postgres ? 'NOW()' : "(datetime('now'))";
    if (!(await queryRunner.hasTable('shopify_oauth_states'))) {
      await queryRunner.query(
        `CREATE TABLE "shopify_oauth_states" ("stateHash" varchar(64) PRIMARY KEY NOT NULL, "storeId" varchar NOT NULL, "expiresAt" ${timestamp} NOT NULL, "createdAt" ${timestamp} NOT NULL DEFAULT ${now})`,
      );
      await queryRunner.query(`CREATE INDEX "IDX_shopify_oauth_expires" ON "shopify_oauth_states" ("expiresAt")`);
    }
    if (!(await queryRunner.hasTable('shopify_webhook_deliveries'))) {
      await queryRunner.query(
        `CREATE TABLE "shopify_webhook_deliveries" ("webhookId" varchar(100) PRIMARY KEY NOT NULL, "storeId" varchar, "topic" varchar(100) NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'processing', "error" text, "attempts" integer NOT NULL DEFAULT 1, "createdAt" ${timestamp} NOT NULL DEFAULT ${now})`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_shopify_delivery_created" ON "shopify_webhook_deliveries" ("createdAt")`,
      );
    }
    if (await queryRunner.hasTable('orders')) {
      const table = await queryRunner.getTable('orders');
      if (!table?.findColumnByName('confirmationStatus')) {
        await queryRunner.query(
          `ALTER TABLE "orders" ADD COLUMN "confirmationStatus" varchar(50) NOT NULL DEFAULT 'not_sent'`,
        );
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "whatsappMessageId" varchar(100)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "confirmationSentAt" ${timestamp}`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "confirmationError" text`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shopify_webhook_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shopify_oauth_states"`);
  }
}
