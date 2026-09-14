import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProviderProductReviewId1790300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('product_reviews');
    if (table && !table.findColumnByName('providerReviewId')) {
      await queryRunner.addColumn('product_reviews', new TableColumn({
        name: 'providerReviewId',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('product_reviews');
    if (table?.findColumnByName('providerReviewId')) {
      await queryRunner.dropColumn('product_reviews', 'providerReviewId');
    }
  }
}
