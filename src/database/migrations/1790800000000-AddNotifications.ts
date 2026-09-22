import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class AddNotifications1790800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const dateType = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime';
    if (!(await queryRunner.hasTable('notifications'))) {
      await queryRunner.createTable(
        new Table({
          name: 'notifications',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'userId', type: 'varchar', length: '36', isNullable: true },
            { name: 'eventType', type: 'varchar', length: '80' },
            { name: 'dedupeKey', type: 'varchar', length: '255', isNullable: true, isUnique: true },
            { name: 'entityId', type: 'varchar', length: '100', isNullable: true },
            { name: 'title', type: 'varchar', length: '160' },
            { name: 'message', type: 'text' },
            { name: 'kind', type: 'varchar', length: '20', default: "'info'" },
            { name: 'link', type: 'varchar', length: '500', isNullable: true },
            { name: 'active', type: 'boolean', default: true },
            { name: 'expiresAt', type: dateType, isNullable: true },
            { name: 'createdAt', type: dateType, default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            { name: 'IDX_notifications_userId', columnNames: ['userId'] },
            { name: 'IDX_notifications_createdAt', columnNames: ['createdAt'] },
            { name: 'IDX_notifications_eventType', columnNames: ['eventType'] },
          ],
        }),
        true,
      );
    }
    if (!(await queryRunner.hasTable('notification_reads'))) {
      await queryRunner.createTable(
        new Table({
          name: 'notification_reads',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'notificationId', type: 'varchar', length: '36' },
            { name: 'userId', type: 'varchar', length: '36' },
            { name: 'readAt', type: dateType, default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            {
              name: 'UQ_notification_reads_notification_user',
              columnNames: ['notificationId', 'userId'],
              isUnique: true,
            },
            { name: 'IDX_notification_reads_userId', columnNames: ['userId'] },
          ],
        }),
        true,
      );
    }
    const reads = await queryRunner.getTable('notification_reads');
    if (reads && !reads.foreignKeys.some(key => key.columnNames.includes('notificationId'))) {
      await queryRunner.createForeignKey(
        'notification_reads',
        new TableForeignKey({
          name: 'FK_notification_reads_notification',
          columnNames: ['notificationId'],
          referencedTableName: 'notifications',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('notification_reads')) await queryRunner.dropTable('notification_reads');
    if (await queryRunner.hasTable('notifications')) await queryRunner.dropTable('notifications');
  }
}
