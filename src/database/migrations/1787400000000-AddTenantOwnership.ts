import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTenantOwnership1787400000000 implements MigrationInterface {
  name = 'AddTenantOwnership1787400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['sessions', 'merchants', 'stores']) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      const table = await queryRunner.getTable(tableName);
      if (!table?.findColumnByName('userId')) {
        await queryRunner.addColumn(tableName, new TableColumn({ name: 'userId', type: 'varchar', isNullable: true }));
      }
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_${tableName}_userId" ON "${tableName}" ("userId")`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['stores', 'merchants', 'sessions']) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName('userId')) await queryRunner.dropColumn(tableName, 'userId');
    }
  }
}
