import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AllowReviewsForRemovedProducts1790400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('product_reviews');
    if (!table) return;
    if (!table.findColumnByName('externalProductId')) {
      await queryRunner.addColumn('product_reviews', new TableColumn({ name: 'externalProductId', type: 'varchar', length: '100', isNullable: true }));
    }
    if (!table.findColumnByName('productName')) {
      await queryRunner.addColumn('product_reviews', new TableColumn({ name: 'productName', type: 'varchar', length: '255', isNullable: true }));
    }
    await queryRunner.query(`UPDATE "product_reviews" SET "externalProductId" = (SELECT "externalProductId" FROM "products" WHERE "products"."id" = "product_reviews"."productId"), "productName" = (SELECT "title" FROM "products" WHERE "products"."id" = "product_reviews"."productId") WHERE "externalProductId" IS NULL OR "productName" IS NULL`);
    table = await queryRunner.getTable('product_reviews');
    const productForeignKey = table?.foreignKeys.find(key => key.columnNames.includes('productId'));
    if (productForeignKey) await queryRunner.dropForeignKey('product_reviews', productForeignKey);
    const productColumn = table?.findColumnByName('productId');
    if (productColumn && !productColumn.isNullable) {
      const nullableProductColumn = productColumn.clone();
      nullableProductColumn.isNullable = true;
      await queryRunner.changeColumn('product_reviews', productColumn, nullableProductColumn);
    }
    await queryRunner.createForeignKey('product_reviews', new TableForeignKey({ columnNames: ['productId'], referencedTableName: 'products', referencedColumnNames: ['id'], onDelete: 'SET NULL' }));
    table = await queryRunner.getTable('product_reviews');
    if (!table?.indices.some(index => index.name === 'IDX_product_reviews_order_external_phone')) {
      await queryRunner.createIndex('product_reviews', new TableIndex({ name: 'IDX_product_reviews_order_external_phone', columnNames: ['orderId', 'externalProductId', 'customerPhone'], isUnique: true }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('product_reviews');
    const index = table?.indices.find(item => item.name === 'IDX_product_reviews_order_external_phone');
    if (index) await queryRunner.dropIndex('product_reviews', index);
  }
}
