import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddCommerceMediaFeatures1790100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const plans = await queryRunner.getTable('billing_plans');
    if (plans && !plans.findColumnByName('capabilities')) {
      await queryRunner.addColumn('billing_plans', new TableColumn({ name: 'capabilities', type: 'text', isNullable: false, default: "'{}'" }));
      await queryRunner.query(`UPDATE "billing_plans" SET "capabilities" = CASE WHEN "slug" = 'free' THEN '{"orderPdf":false,"productImages":false,"productReviews":false,"deliveryNotifications":false}' ELSE '{"orderPdf":true,"productImages":true,"productReviews":true,"deliveryNotifications":true}' END`);
    }

    if (!(await queryRunner.hasTable('product_reviews'))) {
      const dateType = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime';
      const idType = queryRunner.connection.options.type === 'postgres' ? 'uuid' : 'varchar';
      await queryRunner.createTable(new Table({ name: 'product_reviews', columns: [
        { name: 'id', type: idType, isPrimary: true, default: queryRunner.connection.options.type === 'postgres' ? 'gen_random_uuid()' : undefined },
        { name: 'storeId', type: idType },
        { name: 'orderId', type: idType },
        { name: 'productId', type: idType, isNullable: true },
        { name: 'externalProductId', type: 'varchar', length: '100' },
        { name: 'productName', type: 'varchar', length: '255' },
        { name: 'customerPhone', type: 'varchar', length: '50' },
        { name: 'rating', type: 'int' },
        { name: 'comment', type: 'varchar', length: '1000', isNullable: true },
        { name: 'status', type: 'varchar', length: '30', default: "'published'" },
        { name: 'providerReviewId', type: 'varchar', length: '100', isNullable: true },
        { name: 'createdAt', type: dateType, default: 'CURRENT_TIMESTAMP' },
      ] }));
      await queryRunner.createIndex('product_reviews', new TableIndex({ name: 'IDX_product_reviews_verified_purchase', columnNames: ['orderId', 'externalProductId', 'customerPhone'], isUnique: true }));
      for (const relation of [
        { column: 'storeId', table: 'stores' },
        { column: 'orderId', table: 'orders' },
        { column: 'productId', table: 'products' },
      ]) {
        await queryRunner.createForeignKey('product_reviews', new TableForeignKey({ columnNames: [relation.column], referencedTableName: relation.table, referencedColumnNames: ['id'], onDelete: relation.column === 'productId' ? 'SET NULL' : 'CASCADE' }));
      }
    }
    const reviews = await queryRunner.getTable('product_reviews');
    if (reviews && !reviews.findColumnByName('providerReviewId')) {
      await queryRunner.addColumn('product_reviews', new TableColumn({ name: 'providerReviewId', type: 'varchar', length: '100', isNullable: true }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('product_reviews')) await queryRunner.dropTable('product_reviews');
    const plans = await queryRunner.getTable('billing_plans');
    if (plans?.findColumnByName('capabilities')) await queryRunner.dropColumn('billing_plans', 'capabilities');
  }
}
