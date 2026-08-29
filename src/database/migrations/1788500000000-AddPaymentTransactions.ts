import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddPaymentTransactions1788500000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const timestamp = q.connection.options.type === 'postgres' ? 'timestamp' : 'datetime';
    const id = q.connection.options.type === 'postgres' ? 'uuid' : 'varchar';
    await q.createTable(new Table({
      name: 'payment_transactions',
      columns: [
        { name: 'id', type: id, ...(id === 'varchar' ? { length: '36' } : { default: 'gen_random_uuid()' }), isPrimary: true },
        { name: 'userId', type: id, ...(id === 'varchar' ? { length: '36' } : {}) },
        { name: 'provider', type: 'varchar', length: '20' },
        { name: 'providerEventId', type: 'varchar', length: '255' },
        { name: 'providerPaymentId', type: 'varchar', length: '255', isNullable: true },
        { name: 'providerSubscriptionId', type: 'varchar', length: '255', isNullable: true },
        { name: 'status', type: 'varchar', length: '30' },
        { name: 'amount', type: 'int', default: 0 },
        { name: 'currency', type: 'varchar', length: '3', default: "'USD'" },
        { name: 'description', type: 'varchar', length: '255', isNullable: true },
        { name: 'paidAt', type: timestamp, isNullable: true },
        { name: 'createdAt', type: timestamp, default: q.connection.options.type === 'postgres' ? 'CURRENT_TIMESTAMP' : "datetime('now')" },
      ],
    }), true);
    await q.createIndex('payment_transactions', new TableIndex({ name: 'IDX_payment_transactions_user', columnNames: ['userId'] }));
    await q.createIndex('payment_transactions', new TableIndex({ name: 'UQ_payment_provider_event', columnNames: ['provider', 'providerEventId'], isUnique: true }));
  }

  async down(q: QueryRunner): Promise<void> { await q.dropTable('payment_transactions', true); }
}
