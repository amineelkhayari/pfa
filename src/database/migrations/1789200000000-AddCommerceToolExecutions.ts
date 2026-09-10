import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddCommerceToolExecutions1789200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commerce_tool_executions')) return;
    const postgres = queryRunner.connection.options.type === 'postgres';
    const dateType = postgres ? 'timestamp' : 'datetime';
    await queryRunner.createTable(
      new Table({
        name: 'commerce_tool_executions',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            default: postgres ? 'gen_random_uuid()::varchar' : undefined,
          },
          { name: 'operationKey', type: 'varchar', length: '255' },
          { name: 'storeId', type: 'varchar' },
          { name: 'sessionId', type: 'varchar', isNullable: true },
          { name: 'messageId', type: 'varchar', length: '255', isNullable: true },
          { name: 'customerPhone', type: 'varchar', length: '40', isNullable: true },
          { name: 'orderId', type: 'varchar', isNullable: true },
          { name: 'provider', type: 'varchar', length: '50' },
          { name: 'tool', type: 'varchar', length: '80' },
          { name: 'status', type: 'varchar', length: '20', default: "'started'" },
          { name: 'input', type: 'text', isNullable: true },
          { name: 'result', type: 'text', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'durationMs', type: 'integer', isNullable: true },
          { name: 'completedAt', type: dateType, isNullable: true },
          { name: 'createdAt', type: dateType, default: postgres ? 'CURRENT_TIMESTAMP' : "datetime('now')" },
          { name: 'updatedAt', type: dateType, default: postgres ? 'CURRENT_TIMESTAMP' : "datetime('now')" },
        ],
      }),
    );
    await queryRunner.createIndex(
      'commerce_tool_executions',
      new TableIndex({ name: 'IDX_commerce_tool_executions_operation', columnNames: ['operationKey'], isUnique: true }),
    );
    await queryRunner.createIndex(
      'commerce_tool_executions',
      new TableIndex({ name: 'IDX_commerce_tool_executions_store_created', columnNames: ['storeId', 'createdAt'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commerce_tool_executions')) await queryRunner.dropTable('commerce_tool_executions');
  }
}
