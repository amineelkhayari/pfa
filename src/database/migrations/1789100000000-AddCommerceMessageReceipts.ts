import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { dateColumnType } from '../../common/utils/column-types';

export class AddCommerceMessageReceipts1789100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commerce_message_receipts')) return;
    const postgres = queryRunner.connection.options.type === 'postgres';
    await queryRunner.createTable(
      new Table({
        name: 'commerce_message_receipts',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            default: postgres ? 'gen_random_uuid()::varchar' : undefined,
          },
          { name: 'sessionId', type: 'varchar', isNullable: false },
          { name: 'messageId', type: 'varchar', length: '255', isNullable: false },
          { name: 'status', type: 'varchar', length: '20', default: "'processing'" },
          {
            name: 'createdAt',
            type: dateColumnType(),
            default: postgres ? 'CURRENT_TIMESTAMP' : "datetime('now')",
          },
          {
            name: 'updatedAt',
            type: dateColumnType(),
            default: postgres ? 'CURRENT_TIMESTAMP' : "datetime('now')",
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'commerce_message_receipts',
      new TableIndex({
        name: 'IDX_commerce_message_receipts_session_message',
        columnNames: ['sessionId', 'messageId'],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('commerce_message_receipts'))
      await queryRunner.dropTable('commerce_message_receipts');
  }
}
