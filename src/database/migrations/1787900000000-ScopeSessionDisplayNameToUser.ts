import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer-facing session names only need to be unique inside one account. Internal engine names
 * remain globally unique and own the shared authentication directories.
 */
export class ScopeSessionDisplayNameToUser1787900000000 implements MigrationInterface {
  name = 'ScopeSessionDisplayNameToUser1787900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sessions'))) return;
    const table = await queryRunner.getTable('sessions');
    if (!table?.findColumnByName('displayName') || !table.findColumnByName('userId')) return;
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sessions_user_display_name" ON "sessions" ("userId", "displayName")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sessions'))) return;
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sessions_user_display_name"`);
  }
}
