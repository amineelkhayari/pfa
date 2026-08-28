import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddPaymentRefundLink1788600000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const type = q.connection.options.type === 'postgres' ? 'uuid' : 'varchar';
    await q.addColumn('payment_transactions', new TableColumn({ name: 'parentTransactionId', type, ...(type === 'varchar' ? { length: '36' } : {}), isNullable: true }));
    await q.createIndex('payment_transactions', new TableIndex({ name: 'IDX_payment_parent_transaction', columnNames: ['parentTransactionId'] }));
  }
  async down(q: QueryRunner): Promise<void> { await q.dropColumn('payment_transactions', 'parentTransactionId'); }
}
