import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddOrderAiConversations1787600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('order_ai_conversations')) return;
    const postgres = queryRunner.dataSource.options.type === 'postgres';
    const timestamp = postgres ? 'timestamp' : 'datetime';
    const now = postgres ? 'NOW()' : "datetime('now')";
    await queryRunner.createTable(
      new Table({
        name: 'order_ai_conversations',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'orderId', type: 'varchar' },
          { name: 'storeId', type: 'varchar' },
          { name: 'status', type: 'varchar', default: "'active'" },
          { name: 'turnCount', type: 'integer', default: 0 },
          { name: 'turns', type: 'text', isNullable: true },
          { name: 'lastError', type: 'text', isNullable: true },
          { name: 'createdAt', type: timestamp, default: now },
          { name: 'updatedAt', type: timestamp, default: now },
        ],
      }),
    );
    await queryRunner.createIndex(
      'order_ai_conversations',
      new TableIndex({ name: 'UQ_order_ai_conversation_order', columnNames: ['orderId'], isUnique: true }),
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('order_ai_conversations', true);
  }
}
