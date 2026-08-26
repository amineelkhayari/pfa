import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddConversationPendingActions1788400000000 implements MigrationInterface {
  name = 'AddConversationPendingActions1788400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('order_ai_conversations', 'pendingAction'))) {
      await queryRunner.addColumn('order_ai_conversations', new TableColumn({ name: 'pendingAction', type: 'varchar', length: '40', isNullable: true }));
    }
    if (!(await queryRunner.hasColumn('order_ai_conversations', 'pendingData'))) {
      await queryRunner.addColumn('order_ai_conversations', new TableColumn({ name: 'pendingData', type: 'text', isNullable: true }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('order_ai_conversations', 'pendingData')) await queryRunner.dropColumn('order_ai_conversations', 'pendingData');
    if (await queryRunner.hasColumn('order_ai_conversations', 'pendingAction')) await queryRunner.dropColumn('order_ai_conversations', 'pendingAction');
  }
}
