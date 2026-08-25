import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class RemoveMerchants1788200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('stores'))) return;
    const stores = await queryRunner.getTable('stores');
    if (stores?.findColumnByName('merchantId')) {
      if (await queryRunner.hasTable('merchants')) {
        await queryRunner.query(
          `UPDATE "stores" SET "userId" = (SELECT "userId" FROM "merchants" WHERE "merchants"."id" = "stores"."merchantId") WHERE "userId" IS NULL`,
        );
      }
      for (const foreignKey of stores.foreignKeys.filter(key => key.columnNames.includes('merchantId'))) {
        await queryRunner.dropForeignKey(stores, foreignKey);
      }
      for (const index of stores.indices.filter(index => index.columnNames.includes('merchantId'))) {
        await queryRunner.dropIndex(stores, index);
      }
      await queryRunner.dropColumn(stores, 'merchantId');
    }
    const refreshed = await queryRunner.getTable('stores');
    if (refreshed && !refreshed.indices.some(index => index.name === 'IDX_stores_user')) {
      await queryRunner.createIndex('stores', new TableIndex({ name: 'IDX_stores_user', columnNames: ['userId'] }));
    }
    if (await queryRunner.hasTable('merchants')) await queryRunner.dropTable('merchants', true);
  }

  async down(): Promise<void> {
    // Merchant ownership cannot be reconstructed after stores become directly user-owned.
  }
}
