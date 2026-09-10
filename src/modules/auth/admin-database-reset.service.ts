import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserAccount } from './entities/user-account.entity';
import { UserAuthService } from './user-auth.service';

@Injectable()
export class AdminDatabaseResetService {
  constructor(
    @InjectDataSource('data') private readonly dataSource: DataSource,
    @InjectRepository(UserAccount, 'data') private readonly users: Repository<UserAccount>,
    private readonly auth: UserAuthService,
  ) {}

  async reset(adminId: string, password: string, confirmation: string) {
    if (confirmation !== 'RESET') throw new BadRequestException('Type RESET exactly to confirm the database reset.');

    const admin = await this.users.findOneBy({ id: adminId });
    const permanentUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    if (!admin || admin.username !== permanentUsername || admin.role !== 'admin') {
      throw new ForbiddenException('Only the permanent administrator can reset the database.');
    }
    if (!(await this.auth.passwordMatches(admin, password))) {
      throw new UnauthorizedException('Administrator password is incorrect.');
    }

    const userTable = this.users.metadata.tablePath;
    const applicationTables = this.dataSource.entityMetadatas
      .map(metadata => metadata.tablePath)
      .filter((table, index, all) => table !== userTable && all.indexOf(table) === index);

    const databaseType = String(this.dataSource.options.type);
    if (databaseType === 'postgres') {
      await this.dataSource.transaction(async manager => {
        if (applicationTables.length) {
          const tables = applicationTables.map(table => this.qualifiedTable(table)).join(', ');
          await manager.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
        }
        await manager.query(`DELETE FROM ${this.qualifiedTable(userTable)} WHERE "id" <> $1`, [admin.id]);
        await manager.query(
          `UPDATE ${this.qualifiedTable(userTable)} SET "plan" = NULL, "status" = 'active', "sentMessages" = 0, "receivedMessages" = 0, "aiTokensUsed" = 0, "audioTranscriptionsUsed" = 0, "audioRepliesUsed" = 0, "usagePeriodStart" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          [admin.id],
        );
      });
    } else if (databaseType === 'better-sqlite3' || databaseType === 'sqlite') {
      await this.dataSource.query('PRAGMA foreign_keys = OFF');
      try {
        await this.dataSource.transaction(async manager => {
          for (const table of applicationTables) await manager.query(`DELETE FROM ${this.qualifiedTable(table)}`);
          await manager.query(`DELETE FROM ${this.qualifiedTable(userTable)} WHERE "id" <> ?`, [admin.id]);
          await manager.query(
            `UPDATE ${this.qualifiedTable(userTable)} SET "plan" = NULL, "status" = 'active', "sentMessages" = 0, "receivedMessages" = 0, "aiTokensUsed" = 0, "audioTranscriptionsUsed" = 0, "audioRepliesUsed" = 0, "usagePeriodStart" = CURRENT_TIMESTAMP WHERE "id" = ?`,
            [admin.id],
          );
        });
      } finally {
        await this.dataSource.query('PRAGMA foreign_keys = ON');
      }
    } else {
      throw new BadRequestException(`Database reset is not supported for ${databaseType}.`);
    }

    return { reset: true, preservedAdmin: admin.username, signInRequired: true, restartRecommended: true };
  }

  private qualifiedTable(tablePath: string): string {
    return tablePath.split('.').map(part => `"${part.replace(/"/g, '""')}"`).join('.');
  }
}
