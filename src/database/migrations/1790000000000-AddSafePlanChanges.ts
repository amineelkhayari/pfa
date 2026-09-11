import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSafePlanChanges1790000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;
    const dateType = type === 'postgres' ? 'timestamp' : 'text';
    await queryRunner.addColumns('billing_subscriptions', [
      new TableColumn({ name: 'planChangeStatus', type: 'varchar', length: '30', default: "'none'" }),
      new TableColumn({ name: 'pendingPlanSlug', type: 'varchar', length: '50', isNullable: true }),
      new TableColumn({ name: 'planChangeEffectiveAt', type: dateType, isNullable: true }),
      new TableColumn({ name: 'planChangeRequestedAt', type: dateType, isNullable: true }),
      new TableColumn({ name: 'providerScheduleId', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({ name: 'planChangeError', type: 'varchar', length: '500', isNullable: true }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('billing_subscriptions', ['planChangeError', 'providerScheduleId', 'planChangeRequestedAt', 'planChangeEffectiveAt', 'pendingPlanSlug', 'planChangeStatus']);
  }
}
