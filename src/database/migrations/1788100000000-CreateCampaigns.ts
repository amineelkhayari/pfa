import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
export class CreateCampaigns1788100000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const pg = q.connection.options.type === 'postgres';
    await q.createTable(
      new Table({
        name: 'campaigns',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar' },
          { name: 'sessionId', type: 'varchar' },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'message', type: 'text' },
          { name: 'audienceType', type: 'varchar', default: "'store_customers'" },
          { name: 'recipients', type: pg ? 'json' : 'text' },
          { name: 'batchIds', type: pg ? 'json' : 'text' },
          { name: 'status', type: 'varchar', default: "'running'" },
          { name: 'riskScore', type: 'int', default: 0 },
          { name: 'sent', type: 'int', default: 0 },
          { name: 'failed', type: 'int', default: 0 },
          { name: 'pending', type: 'int', default: 0 },
          { name: 'skipped', type: 'int', default: 0 },
          { name: 'completedAt', type: pg ? 'timestamp' : 'datetime', isNullable: true },
          { name: 'createdAt', type: pg ? 'timestamp' : 'datetime', default: pg ? 'now()' : "datetime('now')" },
          { name: 'updatedAt', type: pg ? 'timestamp' : 'datetime', default: pg ? 'now()' : "datetime('now')" },
        ],
      }),
    );
    await q.createIndex(
      'campaigns',
      new TableIndex({ name: 'IDX_campaigns_user_created', columnNames: ['userId', 'createdAt'] }),
    );
  }
  async down(q: QueryRunner) {
    await q.dropTable('campaigns');
  }
}
