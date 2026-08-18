import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddShopifyWebhookDeliveryAttempts1787200000000 implements MigrationInterface {
  name = 'AddShopifyWebhookDeliveryAttempts1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('shopify_webhook_deliveries'))) return;

    const table = await queryRunner.getTable('shopify_webhook_deliveries');
    if (table?.findColumnByName('attempts')) return;

    await queryRunner.addColumn(
      'shopify_webhook_deliveries',
      new TableColumn({
        name: 'attempts',
        type: 'integer',
        isNullable: false,
        default: 1,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('shopify_webhook_deliveries'))) return;

    const table = await queryRunner.getTable('shopify_webhook_deliveries');
    if (!table?.findColumnByName('attempts')) return;

    await queryRunner.dropColumn('shopify_webhook_deliveries', 'attempts');
  }
}
