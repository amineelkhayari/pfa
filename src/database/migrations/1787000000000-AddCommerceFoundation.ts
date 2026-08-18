import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds only the merchant/store catalog owned by the ecommerce feature. */
export class AddCommerceFoundation1787000000000 implements MigrationInterface {
  name = 'AddCommerceFoundation1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.dataSource.options.type === 'postgres';
    const timestamp = postgres ? 'timestamp' : 'datetime';
    const now = postgres ? 'NOW()' : "(datetime('now'))";

    if (!(await queryRunner.hasTable('merchants'))) {
      await queryRunner.query(
        `CREATE TABLE "merchants" (` +
          `"id" varchar PRIMARY KEY NOT NULL, "name" varchar(150) NOT NULL, ` +
          `"email" varchar(255) NOT NULL, "phone" varchar(30), ` +
          `"createdAt" ${timestamp} NOT NULL DEFAULT ${now}, "updatedAt" ${timestamp} NOT NULL DEFAULT ${now})`,
      );
      await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchants_email" ON "merchants" ("email")`);
    }

    if (!(await queryRunner.hasTable('stores'))) {
      await queryRunner.query(
        `CREATE TABLE "stores" (` +
          `"id" varchar PRIMARY KEY NOT NULL, "name" varchar(150) NOT NULL, "provider" varchar(30) NOT NULL, ` +
          `"ownerName" varchar(150), "email" varchar(255) NOT NULL, "phone" varchar(30), ` +
          `"language" varchar(10) NOT NULL DEFAULT 'fr', "timezone" varchar(100) NOT NULL DEFAULT 'Africa/Casablanca', ` +
          `"currency" varchar(10) NOT NULL DEFAULT 'MAD', "settings" text, "status" varchar(30) NOT NULL DEFAULT 'active', ` +
          `"merchantId" varchar NOT NULL, "sessionId" varchar NOT NULL, ` +
          `"createdAt" ${timestamp} NOT NULL DEFAULT ${now}, "updatedAt" ${timestamp} NOT NULL DEFAULT ${now}, ` +
          `CONSTRAINT "FK_stores_merchant" FOREIGN KEY ("merchantId") REFERENCES "merchants" ("id") ON DELETE CASCADE, ` +
          `CONSTRAINT "FK_stores_session" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE RESTRICT)`,
      );
      await queryRunner.query(`CREATE UNIQUE INDEX "UQ_stores_session" ON "stores" ("sessionId")`);
      await queryRunner.query(`CREATE UNIQUE INDEX "UQ_stores_merchant_name" ON "stores" ("merchantId", "name")`);
      await queryRunner.query(`CREATE INDEX "IDX_stores_merchant" ON "stores" ("merchantId")`);
    }

    if (!(await queryRunner.hasTable('products'))) {
      await queryRunner.query(
        `CREATE TABLE "products" (` +
          `"id" varchar PRIMARY KEY NOT NULL, "storeId" varchar NOT NULL, "shopifyProductId" varchar(100) NOT NULL, ` +
          `"title" varchar(255) NOT NULL, "description" text, "handle" varchar(255), "productType" varchar(255), ` +
          `"vendor" varchar(255), "status" varchar(50) NOT NULL DEFAULT 'active', "tags" text, "imageUrl" text, ` +
          `"variants" text, "price" decimal(12,2) NOT NULL DEFAULT 0, ` +
          `"shopifyCreatedAt" ${timestamp} NOT NULL DEFAULT ${now}, "shopifyUpdatedAt" ${timestamp} NOT NULL DEFAULT ${now}, ` +
          `"createdAt" ${timestamp} NOT NULL DEFAULT ${now}, ` +
          `CONSTRAINT "FK_products_store" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE)`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_products_store_shopify" ON "products" ("storeId", "shopifyProductId")`,
      );
    }

    if (!(await queryRunner.hasTable('orders'))) {
      await queryRunner.query(
        `CREATE TABLE "orders" (` +
          `"id" varchar PRIMARY KEY NOT NULL, "storeId" varchar NOT NULL, "shopifyOrderId" varchar(100) NOT NULL, ` +
          `"orderNumber" varchar(100), "email" varchar(255), "phone" varchar(50), "customerName" varchar(255), ` +
          `"totalPrice" decimal(12,2) NOT NULL DEFAULT 0, "currency" varchar(10) NOT NULL DEFAULT 'USD', ` +
          `"financialStatus" varchar(50), "fulfillmentStatus" varchar(50), "lineItems" text, "shippingAddress" text, ` +
          `"customer" text, "tags" text, "status" varchar(50) NOT NULL DEFAULT 'open', ` +
          `"shopifyCreatedAt" ${timestamp} NOT NULL DEFAULT ${now}, "createdAt" ${timestamp} NOT NULL DEFAULT ${now}, ` +
          `CONSTRAINT "FK_orders_store" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE CASCADE)`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_orders_store_shopify" ON "orders" ("storeId", "shopifyOrderId")`,
      );
      await queryRunner.query(`CREATE INDEX "IDX_orders_store_status" ON "orders" ("storeId", "status")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchants"`);
  }
}
