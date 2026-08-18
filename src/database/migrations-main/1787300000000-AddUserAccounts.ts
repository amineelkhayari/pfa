import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAccounts1787300000000 implements MigrationInterface {
  name = 'AddUserAccounts1787300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_accounts" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(120) NOT NULL, "email" varchar(255) NOT NULL, "username" varchar(80) NOT NULL, "passwordHash" varchar(255) NOT NULL, "role" varchar(20) NOT NULL DEFAULT 'operator', "plan" varchar(20) NOT NULL DEFAULT 'free', "status" varchar(20) NOT NULL DEFAULT 'active', "settings" text, "sentMessages" integer NOT NULL DEFAULT 0, "receivedMessages" integer NOT NULL DEFAULT 0, "usagePeriodStart" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_accounts_email" ON "user_accounts" ("email")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_accounts_username" ON "user_accounts" ("username")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_login_sessions" ("id" varchar PRIMARY KEY NOT NULL, "tokenHash" varchar(64) NOT NULL, "userId" varchar NOT NULL, "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_login_sessions_token" ON "user_login_sessions" ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_login_sessions_user" ON "user_login_sessions" ("userId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_login_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_accounts"`);
  }
}
