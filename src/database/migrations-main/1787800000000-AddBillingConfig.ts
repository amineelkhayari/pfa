import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddBillingConfig1787800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('billing_config')) return;
    await queryRunner.createTable(new Table({ name: 'billing_config', columns: [
      { name: 'id', type: 'varchar', length: '20', isPrimary: true },
      { name: 'encryptedSettings', type: 'text' },
      { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
    ] }));
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.dropTable('billing_config', true); }
}
