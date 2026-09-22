import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/** Upgrades databases that briefly received the earlier manual-announcement schema. */
export class UpgradeSystemNotifications1790900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    if (!table) return;

    if (!table.findColumnByName('eventType')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({ name: 'eventType', type: 'varchar', length: '80', default: "'system_event'" }),
      );
    }
    if (!table.findColumnByName('dedupeKey')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({ name: 'dedupeKey', type: 'varchar', length: '255', isNullable: true }),
      );
    }
    if (!table.findColumnByName('entityId')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({ name: 'entityId', type: 'varchar', length: '100', isNullable: true }),
      );
    }

    const refreshed = await queryRunner.getTable('notifications');
    if (refreshed?.findColumnByName('createdByUserId')) {
      await queryRunner.dropColumn(refreshed, 'createdByUserId');
    }

    const current = await queryRunner.getTable('notifications');
    if (current && !current.indices.some(index => index.name === 'IDX_notifications_eventType')) {
      await queryRunner.createIndex(
        current,
        new TableIndex({ name: 'IDX_notifications_eventType', columnNames: ['eventType'] }),
      );
    }
    if (current && !current.indices.some(index => index.name === 'UQ_notifications_dedupeKey')) {
      await queryRunner.createIndex(
        current,
        new TableIndex({ name: 'UQ_notifications_dedupeKey', columnNames: ['dedupeKey'], isUnique: true }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    if (!table) return;
    const unique = table.indices.find(index => index.name === 'UQ_notifications_dedupeKey');
    if (unique) await queryRunner.dropIndex(table, unique);
    const eventIndex = table.indices.find(index => index.name === 'IDX_notifications_eventType');
    if (eventIndex) await queryRunner.dropIndex(table, eventIndex);
    for (const column of ['entityId', 'dedupeKey', 'eventType']) {
      const current = await queryRunner.getTable('notifications');
      if (current?.findColumnByName(column)) await queryRunner.dropColumn(current, column);
    }
  }
}
