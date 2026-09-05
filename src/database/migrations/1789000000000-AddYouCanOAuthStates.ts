import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { dateColumnType } from '../../common/utils/column-types';

export class AddYouCanOAuthStates1789000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) { if (await queryRunner.hasTable('youcan_oauth_states')) return; await queryRunner.createTable(new Table({ name: 'youcan_oauth_states', columns: [{ name: 'stateHash', type: 'varchar', length: '64', isPrimary: true }, { name: 'storeId', type: 'varchar' }, { name: 'expiresAt', type: dateColumnType(), isNullable: false }, { name: 'createdAt', type: dateColumnType(), default: queryRunner.connection.options.type === 'postgres' ? 'CURRENT_TIMESTAMP' : "datetime('now')" }] })); }
  async down(queryRunner: QueryRunner) { if (await queryRunner.hasTable('youcan_oauth_states')) await queryRunner.dropTable('youcan_oauth_states'); }
}
