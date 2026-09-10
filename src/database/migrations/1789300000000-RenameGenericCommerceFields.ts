import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class RenameGenericCommerceFields1789300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await this.rename(queryRunner, 'products', 'shopifyProductId', 'externalProductId');
    await this.rename(queryRunner, 'products', 'shopifyCreatedAt', 'externalCreatedAt');
    await this.rename(queryRunner, 'products', 'shopifyUpdatedAt', 'externalUpdatedAt');
    await this.rename(queryRunner, 'orders', 'shopifyOrderId', 'externalOrderId');
    await this.rename(queryRunner, 'orders', 'shopifyCreatedAt', 'externalCreatedAt');
    await this.replaceUniqueIndex(queryRunner, 'products', 'UQ_products_store_shopify', 'UQ_products_store_external', [
      'storeId',
      'externalProductId',
    ]);
    await this.replaceUniqueIndex(queryRunner, 'orders', 'UQ_orders_store_shopify', 'UQ_orders_store_external', [
      'storeId',
      'externalOrderId',
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.rename(queryRunner, 'products', 'externalProductId', 'shopifyProductId');
    await this.rename(queryRunner, 'products', 'externalCreatedAt', 'shopifyCreatedAt');
    await this.rename(queryRunner, 'products', 'externalUpdatedAt', 'shopifyUpdatedAt');
    await this.rename(queryRunner, 'orders', 'externalOrderId', 'shopifyOrderId');
    await this.rename(queryRunner, 'orders', 'externalCreatedAt', 'shopifyCreatedAt');
    await this.replaceUniqueIndex(queryRunner, 'products', 'UQ_products_store_external', 'UQ_products_store_shopify', [
      'storeId',
      'shopifyProductId',
    ]);
    await this.replaceUniqueIndex(queryRunner, 'orders', 'UQ_orders_store_external', 'UQ_orders_store_shopify', [
      'storeId',
      'shopifyOrderId',
    ]);
  }

  private async rename(queryRunner: QueryRunner, tableName: string, from: string, to: string): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (table?.findColumnByName(from) && !table.findColumnByName(to))
      await queryRunner.renameColumn(tableName, from, to);
  }

  private async replaceUniqueIndex(
    queryRunner: QueryRunner,
    tableName: string,
    oldName: string,
    newName: string,
    currentColumns: string[],
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const oldIndex = table.indices.find(index => index.name === oldName);
    if (oldIndex) await queryRunner.dropIndex(tableName, oldIndex);
    const refreshed = await queryRunner.getTable(tableName);
    const exists = refreshed?.indices.some(
      index => index.isUnique && currentColumns.every(column => index.columnNames.includes(column)),
    );
    if (!exists)
      await queryRunner.createIndex(
        tableName,
        new TableIndex({ name: newName, columnNames: currentColumns, isUnique: true }),
      );
  }
}
