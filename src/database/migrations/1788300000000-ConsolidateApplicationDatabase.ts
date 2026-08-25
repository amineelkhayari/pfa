import { MigrationInterface, QueryRunner } from 'typeorm';

/** Moves the former main-database schema into the single application datasource. */
export class ConsolidateApplicationDatabase1788300000000 implements MigrationInterface {
  name = 'ConsolidateApplicationDatabase1788300000000';

  async up(q: QueryRunner): Promise<void> {
    const pg = q.connection.options.type === 'postgres';
    const id = pg ? 'uuid' : 'varchar';
    const date = pg ? 'timestamp' : 'text';
    const boolTrue = pg ? 'true' : '1';
    const boolFalse = pg ? 'false' : '0';

    await q.query(`CREATE TABLE IF NOT EXISTS "api_keys" (
      "id" ${id} PRIMARY KEY, "name" varchar(100) NOT NULL,
      "keyHash" varchar(64) NOT NULL, "keyPrefix" varchar(12) NOT NULL,
      "role" varchar(20) NOT NULL DEFAULT 'operator', "allowedIps" text,
      "allowedSessions" text, "isActive" boolean NOT NULL DEFAULT ${boolTrue},
      "expiresAt" ${date}, "lastUsedAt" ${date}, "usageCount" integer NOT NULL DEFAULT 0,
      "createdAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_api_keys_keyHash" ON "api_keys" ("keyHash")`);

    await q.query(`CREATE TABLE IF NOT EXISTS "audit_logs" (
      "id" ${id} PRIMARY KEY, "action" varchar(50) NOT NULL,
      "severity" varchar(10) NOT NULL DEFAULT 'info', "apiKeyId" ${id},
      "apiKeyName" varchar(100), "sessionId" ${id}, "sessionName" varchar(100),
      "ipAddress" varchar(45), "userAgent" varchar(500), "method" varchar(10),
      "path" varchar(500), "statusCode" integer, "metadata" text, "errorMessage" text,
      "createdAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    for (const column of ['action', 'apiKeyId', 'sessionId', 'createdAt']) {
      await q.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_${column}" ON "audit_logs" ("${column}")`);
    }

    await q.query(`CREATE TABLE IF NOT EXISTS "user_accounts" (
      "id" ${id} PRIMARY KEY, "name" varchar(120) NOT NULL, "email" varchar(255) NOT NULL,
      "username" varchar(80) NOT NULL, "passwordHash" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL DEFAULT 'operator', "plan" varchar(20) DEFAULT 'free',
      "status" varchar(20) NOT NULL DEFAULT 'active', "settings" text,
      "sentMessages" integer NOT NULL DEFAULT 0, "receivedMessages" integer NOT NULL DEFAULT 0,
      "usagePeriodStart" ${date} NOT NULL, "createdAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_accounts_email" ON "user_accounts" ("email")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_accounts_username" ON "user_accounts" ("username")`);

    await q.query(`CREATE TABLE IF NOT EXISTS "user_login_sessions" (
      "id" ${id} PRIMARY KEY, "tokenHash" varchar(64) NOT NULL, "userId" ${id} NOT NULL,
      "expiresAt" ${date} NOT NULL, "createdAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_login_sessions_token" ON "user_login_sessions" ("tokenHash")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_user_login_sessions_user" ON "user_login_sessions" ("userId")`);

    await q.query(`CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
      "id" ${id} PRIMARY KEY, "userId" ${id} NOT NULL, "provider" varchar(20) NOT NULL,
      "providerCustomerId" varchar(255), "providerSubscriptionId" varchar(255),
      "status" varchar(40) NOT NULL DEFAULT 'pending', "currentPeriodEnd" ${date},
      "cancelAtPeriodEnd" boolean NOT NULL DEFAULT ${boolFalse},
      "createdAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_billing_user" ON "billing_subscriptions" ("userId")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billing_provider_subscription" ON "billing_subscriptions" ("provider", "providerSubscriptionId")`);

    await q.query(`CREATE TABLE IF NOT EXISTS "billing_config" (
      "id" varchar(20) PRIMARY KEY, "encryptedSettings" text NOT NULL,
      "updatedAt" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ['billing_config', 'billing_subscriptions', 'user_login_sessions', 'user_accounts', 'audit_logs', 'api_keys']) {
      await q.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
