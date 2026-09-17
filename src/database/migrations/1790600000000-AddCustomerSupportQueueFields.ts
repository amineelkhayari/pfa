import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCustomerSupportQueueFields1790600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('customer_support_conversations');
    if (!table) return;
    if (!table.findColumnByName('priority')) await queryRunner.addColumn(table, new TableColumn({ name: 'priority', type: 'varchar', length: '20', default: "'normal'" }));
    if (!table.findColumnByName('tags')) await queryRunner.addColumn(table, new TableColumn({ name: 'tags', type: 'text', isNullable: true }));
    if (!table.findColumnByName('assignedUserId')) await queryRunner.addColumn(table, new TableColumn({ name: 'assignedUserId', type: 'varchar', isNullable: true }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('customer_support_conversations');
    if (!table) return;
    for (const name of ['assignedUserId', 'tags', 'priority']) {
      if (table.findColumnByName(name)) await queryRunner.dropColumn(table, name);
    }
  }
}
