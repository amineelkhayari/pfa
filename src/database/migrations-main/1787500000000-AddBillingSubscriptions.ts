import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddBillingSubscriptions1787500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('billing_subscriptions')) return;
    await queryRunner.createTable(new Table({ name: 'billing_subscriptions', columns: [
      { name: 'id', type: 'varchar', isPrimary: true }, { name: 'userId', type: 'varchar' },
      { name: 'provider', type: 'varchar', length: '20' }, { name: 'providerCustomerId', type: 'varchar', isNullable: true },
      { name: 'providerSubscriptionId', type: 'varchar', isNullable: true }, { name: 'status', type: 'varchar', default: "'pending'" },
      { name: 'currentPeriodEnd', type: 'datetime', isNullable: true }, { name: 'cancelAtPeriodEnd', type: 'boolean', default: false },
      { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' }, { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
    ] }));
    await queryRunner.createIndex('billing_subscriptions', new TableIndex({ name: 'IDX_billing_user', columnNames: ['userId'] }));
    await queryRunner.createIndex('billing_subscriptions', new TableIndex({ name: 'UQ_billing_provider_subscription', columnNames: ['provider', 'providerSubscriptionId'], isUnique: true }));
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.dropTable('billing_subscriptions', true); }
}
