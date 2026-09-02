import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAudioUsageQuotas1788900000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('user_accounts', 'audioTranscriptionsUsed'))) await q.addColumn('user_accounts', new TableColumn({ name: 'audioTranscriptionsUsed', type: 'int', default: 0 }));
    if (!(await q.hasColumn('user_accounts', 'audioRepliesUsed'))) await q.addColumn('user_accounts', new TableColumn({ name: 'audioRepliesUsed', type: 'int', default: 0 }));
  }
  async down(q: QueryRunner): Promise<void> {
    if (await q.hasColumn('user_accounts', 'audioRepliesUsed')) await q.dropColumn('user_accounts', 'audioRepliesUsed');
    if (await q.hasColumn('user_accounts', 'audioTranscriptionsUsed')) await q.dropColumn('user_accounts', 'audioTranscriptionsUsed');
  }
}
