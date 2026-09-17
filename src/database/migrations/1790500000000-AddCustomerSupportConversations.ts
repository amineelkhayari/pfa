import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddCustomerSupportConversations1790500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('customer_support_conversations')) return;
    const postgres = queryRunner.connection.options.type === 'postgres';
    await queryRunner.createTable(new Table({
      name: 'customer_support_conversations',
      columns: [
        { name: 'id', type: postgres ? 'uuid' : 'varchar', isPrimary: true, default: postgres ? 'gen_random_uuid()' : undefined },
        { name: 'sessionId', type: 'varchar', length: '64' },
        { name: 'chatId', type: 'varchar', length: '100' },
        { name: 'phone', type: 'varchar', length: '40', isNullable: true },
        { name: 'mode', type: 'varchar', length: '20', default: "'ai'" },
        { name: 'issueStatus', type: 'varchar', length: '20', default: "'open'" },
        { name: 'issueSummary', type: 'text', isNullable: true },
        { name: 'assignedAt', type: postgres ? 'timestamp' : 'datetime', isNullable: true },
        { name: 'lastHumanMessageAt', type: postgres ? 'timestamp' : 'datetime', isNullable: true },
        { name: 'createdAt', type: postgres ? 'timestamp' : 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updatedAt', type: postgres ? 'timestamp' : 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }));
    await queryRunner.createIndex('customer_support_conversations', new TableIndex({
      name: 'IDX_customer_support_session_chat',
      columnNames: ['sessionId', 'chatId'],
      isUnique: true,
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('customer_support_conversations')) {
      await queryRunner.dropTable('customer_support_conversations');
    }
  }
}
