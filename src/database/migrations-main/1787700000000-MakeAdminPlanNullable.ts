import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeAdminPlanNullable1787700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_accounts');
    const plan = table?.findColumnByName('plan');
    if (plan && !plan.isNullable) await queryRunner.changeColumn('user_accounts', plan, new TableColumn({ ...plan, isNullable: true }));
    await queryRunner.query("UPDATE user_accounts SET plan = NULL WHERE role = 'admin'");
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE user_accounts SET plan = 'free' WHERE plan IS NULL");
    const table = await queryRunner.getTable('user_accounts');
    const plan = table?.findColumnByName('plan');
    if (plan?.isNullable) await queryRunner.changeColumn('user_accounts', plan, new TableColumn({ ...plan, isNullable: false }));
  }
}
