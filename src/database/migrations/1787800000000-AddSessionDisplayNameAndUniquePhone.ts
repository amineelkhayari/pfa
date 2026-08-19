import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSessionDisplayNameAndUniquePhone1787800000000 implements MigrationInterface {
  name = 'AddSessionDisplayNameAndUniquePhone1787800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sessions'))) return;
    const table = await queryRunner.getTable('sessions');
    if (!table?.findColumnByName('displayName')) {
      await queryRunner.addColumn('sessions', new TableColumn({ name: 'displayName', type: 'varchar', length: '50', isNullable: true }));
    }
    // Preserve the most recently connected owner of a number and clear stale duplicate projections
    // before installing the invariant. NULL remains allowed for every unlinked session.
    await queryRunner.query(`UPDATE "sessions" SET "phone" = NULL WHERE "phone" IS NOT NULL AND "id" NOT IN (SELECT keep."id" FROM "sessions" keep WHERE keep."phone" = "sessions"."phone" ORDER BY keep."connectedAt" DESC, keep."updatedAt" DESC LIMIT 1)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sessions_phone" ON "sessions" ("phone")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sessions'))) return;
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sessions_phone"`);
    const table = await queryRunner.getTable('sessions');
    if (table?.findColumnByName('displayName')) await queryRunner.dropColumn('sessions', 'displayName');
  }
}
