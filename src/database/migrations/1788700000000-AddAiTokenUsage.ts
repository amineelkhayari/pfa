import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAiTokenUsage1788700000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('user_accounts', 'aiTokensUsed'))) await q.addColumn('user_accounts', new TableColumn({ name: 'aiTokensUsed', type: 'int', default: 0 }));
  }
  async down(q: QueryRunner): Promise<void> { if (await q.hasColumn('user_accounts', 'aiTokensUsed')) await q.dropColumn('user_accounts', 'aiTokensUsed'); }
}
