import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1789390174457 implements MigrationInterface {
    name = ' $npmConfigName1789390174457'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_payment_parent_transaction"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payment_transactions_user"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_payment_provider_event"`);
        await queryRunner.query(`DROP INDEX "public"."idx_messages_body_ts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_commerce_message_receipts_session_message"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_commerce_tool_executions_operation"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_commerce_tool_executions_store_created"`);
        await queryRunner.query(`CREATE TABLE "product_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "storeId" uuid NOT NULL, "orderId" uuid NOT NULL, "productId" uuid NOT NULL, "customerPhone" character varying(50) NOT NULL, "rating" integer NOT NULL, "comment" character varying(1000), "status" character varying(30) NOT NULL DEFAULT 'published', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_67c1501aea1b0633ec441b00bd5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_42870c0e7169ccf72270d357e4" ON "product_reviews"  ("orderId", "productId", "customerPhone") `);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "body_ts"`);
        await queryRunner.query(`DELETE FROM "public"."typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","body_ts","postgres","public","messages"]);
        await queryRunner.query(`ALTER TABLE "billing_plans" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "billing_plans" DROP CONSTRAINT "UQ_1df145a154eeaabf30d43c5f74c"`);
        await queryRunner.query(`ALTER TABLE "billing_plans" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "billing_plans" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" DROP CONSTRAINT "PK_0dc7104c03884738c2c90f6951d"`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ADD CONSTRAINT "PK_0dc7104c03884738c2c90f6951d" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" DROP CONSTRAINT "PK_f55ff777279c350d61c16fc71b6"`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ADD CONSTRAINT "PK_f55ff777279c350d61c16fc71b6" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "youcan_oauth_states" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1df145a154eeaabf30d43c5f74" ON "billing_plans"  ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_60b852936ca1e980cce98d977a" ON "payment_transactions"  ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b9fa5202c975489ee2e473fc0" ON "payment_transactions"  ("parentTransactionId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2810888396d318ee075d307fef" ON "payment_transactions"  ("provider", "providerEventId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f33e71eb0f77121cd4d86d044a" ON "commerce_message_receipts"  ("sessionId", "messageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8fb0f63585c59ccc58053b92db" ON "commerce_tool_executions"  ("storeId", "createdAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_86f8657421dcddd948ee275065" ON "commerce_tool_executions"  ("operationKey") `);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD CONSTRAINT "FK_37b0fd0be2b97d977e03de4fa10" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD CONSTRAINT "FK_f1432cc7dde8c52ac11151d439e" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD CONSTRAINT "FK_32edd80d91dff1bc19e79c8f16d" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP CONSTRAINT "FK_32edd80d91dff1bc19e79c8f16d"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP CONSTRAINT "FK_f1432cc7dde8c52ac11151d439e"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP CONSTRAINT "FK_37b0fd0be2b97d977e03de4fa10"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_86f8657421dcddd948ee275065"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8fb0f63585c59ccc58053b92db"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f33e71eb0f77121cd4d86d044a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2810888396d318ee075d307fef"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4b9fa5202c975489ee2e473fc0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_60b852936ca1e980cce98d977a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1df145a154eeaabf30d43c5f74"`);
        await queryRunner.query(`ALTER TABLE "youcan_oauth_states" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" DROP CONSTRAINT "PK_f55ff777279c350d61c16fc71b6"`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ADD "id" character varying NOT NULL DEFAULT (gen_random_uuid())`);
        await queryRunner.query(`ALTER TABLE "commerce_tool_executions" ADD CONSTRAINT "PK_f55ff777279c350d61c16fc71b6" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" DROP CONSTRAINT "PK_0dc7104c03884738c2c90f6951d"`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ADD "id" character varying NOT NULL DEFAULT (gen_random_uuid())`);
        await queryRunner.query(`ALTER TABLE "commerce_message_receipts" ADD CONSTRAINT "PK_0dc7104c03884738c2c90f6951d" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "billing_plans" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "billing_plans" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "billing_plans" ADD CONSTRAINT "UQ_1df145a154eeaabf30d43c5f74c" UNIQUE ("slug")`);
        await queryRunner.query(`ALTER TABLE "billing_plans" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`INSERT INTO "public"."typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["postgres","public","messages","GENERATED_COLUMN","body_ts",""]);
        await queryRunner.query(`ALTER TABLE "messages" ADD "body_ts" tsvector`);
        await queryRunner.query(`DROP INDEX "public"."IDX_42870c0e7169ccf72270d357e4"`);
        await queryRunner.query(`DROP TABLE "product_reviews"`);
        await queryRunner.query(`CREATE INDEX "IDX_commerce_tool_executions_store_created" ON "commerce_tool_executions" USING btree ("createdAt", "storeId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_commerce_tool_executions_operation" ON "commerce_tool_executions" USING btree ("operationKey") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_commerce_message_receipts_session_message" ON "commerce_message_receipts" USING btree ("messageId", "sessionId") `);
        await queryRunner.query(`CREATE INDEX "idx_messages_body_ts" ON "messages" USING gin ("body_ts") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_payment_provider_event" ON "payment_transactions" USING btree ("provider", "providerEventId") `);
        await queryRunner.query(`CREATE INDEX "IDX_payment_transactions_user" ON "payment_transactions" USING btree ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_payment_parent_transaction" ON "payment_transactions" USING btree ("parentTransactionId") `);
    }

}
