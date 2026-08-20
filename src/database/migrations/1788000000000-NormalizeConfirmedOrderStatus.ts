import { MigrationInterface, QueryRunner } from 'typeorm';

/** Keep the platform lifecycle status consistent with a completed WhatsApp confirmation. */
export class NormalizeConfirmedOrderStatus1788000000000 implements MigrationInterface {
  name = 'NormalizeConfirmedOrderStatus1788000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('orders'))) return;
    await queryRunner.query(
      `UPDATE "orders" SET "status" = 'confirmed' WHERE "confirmationStatus" = 'confirmed' AND "status" = 'open'`,
    );
  }

  async down(): Promise<void> {
    // Data normalization is intentionally not reversed: confirmation remains historical truth.
  }
}
