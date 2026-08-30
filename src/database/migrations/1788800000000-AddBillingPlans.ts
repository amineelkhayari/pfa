import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddBillingPlans1788800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({ name: 'billing_plans', columns: [
      { name: 'id', type: queryRunner.connection.options.type === 'postgres' ? 'uuid' : 'varchar', length: queryRunner.connection.options.type === 'postgres' ? undefined : '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' }, { name: 'slug', type: 'varchar', length: '50', isUnique: true },
      { name: 'name', type: 'varchar', length: '80' }, { name: 'description', type: 'varchar', length: '240', default: "''" },
      { name: 'priceMonthly', type: 'integer', default: 0 }, { name: 'currency', type: 'varchar', length: '3', default: "'USD'" },
      // `simple-json` is an entity mapping, not a physical PostgreSQL type. The actual
      // cross-database storage type is TEXT; TypeORM serializes it through the entity metadata.
      { name: 'limits', type: 'text' }, { name: 'features', type: 'text' }, { name: 'trialDays', type: 'integer', default: 0 },
      { name: 'active', type: 'boolean', default: true }, { name: 'highlighted', type: 'boolean', default: false }, { name: 'sortOrder', type: 'integer', default: 0 },
      { name: 'stripePriceId', type: 'varchar', length: '255', isNullable: true }, { name: 'paypalPlanId', type: 'varchar', length: '255', isNullable: true },
      { name: 'createdAt', type: queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime', default: queryRunner.connection.options.type === 'postgres' ? 'CURRENT_TIMESTAMP' : "datetime('now')" },
      { name: 'updatedAt', type: queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime', default: queryRunner.connection.options.type === 'postgres' ? 'CURRENT_TIMESTAMP' : "datetime('now')" },
    ] }));
    await queryRunner.addColumn('billing_subscriptions', new TableColumn({ name: 'planSlug', type: 'varchar', length: '50', default: "'pro'" }));
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.dropColumn('billing_subscriptions', 'planSlug'); await queryRunner.dropTable('billing_plans'); }
}
