import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRefundRequestColumns1790950000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('payment_transactions');
    if (!table) return;

    const isPg = queryRunner.connection.driver.options.type === 'postgres';

    if (!table.findColumnByName('refundRequestedAt')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'refundRequestedAt',
          type: isPg ? 'timestamp' : 'text',
          isNullable: true,
        }),
      );
    }
    if (!table.findColumnByName('refundRequestReason')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'refundRequestReason',
          type: 'varchar',
          length: '500',
          isNullable: true,
        }),
      );
    }
    if (!table.findColumnByName('refundRequestStatus')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'refundRequestStatus',
          type: 'varchar',
          length: '30',
          default: "'none'",
          isNullable: true,
        }),
      );
    }
    if (!table.findColumnByName('refundRejectionReason')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'refundRejectionReason',
          type: 'varchar',
          length: '500',
          isNullable: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('payment_transactions');
    if (!table) return;
    for (const col of ['refundRejectionReason', 'refundRequestStatus', 'refundRequestReason', 'refundRequestedAt']) {
      if (table.findColumnByName(col)) {
        await queryRunner.dropColumn(table, col);
      }
    }
  }
}
