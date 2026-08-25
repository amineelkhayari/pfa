import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddStoreOrderCarts1787700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('store_order_carts')) return;
    const postgres = queryRunner.dataSource.options.type === 'postgres';
    const timestamp = postgres ? 'timestamp' : 'datetime';
    const now = postgres ? 'NOW()' : "datetime('now')";
    await queryRunner.createTable(
      new Table({
        name: 'store_order_carts',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'storeId', type: 'varchar' },
          { name: 'phone', type: 'varchar', length: '40' },
          { name: 'step', type: 'varchar', default: "'product'" },
          { name: 'productId', type: 'varchar', isNullable: true },
          { name: 'variantId', type: 'varchar', isNullable: true },
          { name: 'variantTitle', type: 'varchar', isNullable: true },
          { name: 'quantity', type: 'integer', default: 1 },
          { name: 'customerName', type: 'varchar', isNullable: true },
          { name: 'address1', type: 'text', isNullable: true },
          { name: 'city', type: 'varchar', isNullable: true },
          { name: 'postalCode', type: 'varchar', isNullable: true },
          { name: 'country', type: 'varchar', default: "'Morocco'" },
          { name: 'createdAt', type: timestamp, default: now },
          { name: 'updatedAt', type: timestamp, default: now },
        ],
      }),
    );
    await queryRunner.createIndex(
      'store_order_carts',
      new TableIndex({ name: 'UQ_store_order_cart_customer', columnNames: ['storeId', 'phone'], isUnique: true }),
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('store_order_carts', true);
  }
}
