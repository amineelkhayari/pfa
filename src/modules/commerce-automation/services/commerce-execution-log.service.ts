import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { createLogger } from '../../../common/services/logger.service';
import { CommerceToolExecution } from '../../stores/entities/commerce-tool-execution.entity';

export interface StartCommerceExecution {
  operationKey: string;
  storeId: string;
  sessionId?: string;
  messageId?: string;
  customerPhone?: string;
  orderId?: string;
  provider: string;
  tool: string;
  input?: Record<string, unknown>;
}

@Injectable()
export class CommerceExecutionLogService implements OnModuleInit {
  private readonly logger = createLogger('CommerceExecutionLogService');

  constructor(
    @InjectRepository(CommerceToolExecution, 'data')
    private readonly executions: Repository<CommerceToolExecution>,
  ) {}

  async onModuleInit(): Promise<void> {
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const result = await this.executions.update(
      { status: 'started', updatedAt: LessThan(staleBefore) },
      {
        status: 'uncertain',
        errorMessage: 'Worker stopped before the provider result was recorded. Verify the provider before retrying.',
        completedAt: new Date(),
      },
    );
    if (result.affected)
      this.logger.warn('Stale commerce executions require reconciliation', {
        action: 'commerce_executions_uncertain',
        count: result.affected,
      });
  }

  async start(input: StartCommerceExecution): Promise<CommerceToolExecution> {
    const execution = this.executions.create({
      ...input,
      sessionId: input.sessionId ?? null,
      messageId: input.messageId ?? null,
      customerPhone: input.customerPhone ?? null,
      orderId: input.orderId ?? null,
      input: input.input ?? null,
      result: null,
      errorMessage: null,
      durationMs: null,
      status: 'started',
    });
    return this.executions.save(execution);
  }

  async succeed(execution: CommerceToolExecution, result: Record<string, unknown>): Promise<void> {
    execution.status = 'succeeded';
    execution.result = result;
    execution.errorMessage = null;
    execution.completedAt = new Date();
    execution.durationMs = this.duration(execution);
    await this.executions.save(execution);
  }

  async fail(execution: CommerceToolExecution, error: unknown): Promise<void> {
    execution.status = 'failed';
    execution.errorMessage = error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000);
    execution.completedAt = new Date();
    execution.durationMs = this.duration(execution);
    await this.executions.save(execution);
  }

  async list(filters: {
    status?: string;
    provider?: string;
    storeId?: string;
    tool?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: CommerceToolExecution[]; total: number; summary: Record<string, number> }> {
    const query = this.executions.createQueryBuilder('execution');
    if (filters.status) query.andWhere('execution.status = :status', { status: filters.status });
    if (filters.provider) query.andWhere('execution.provider = :provider', { provider: filters.provider });
    if (filters.storeId) query.andWhere('execution.storeId = :storeId', { storeId: filters.storeId });
    if (filters.tool) query.andWhere('execution.tool = :tool', { tool: filters.tool });
    const from = this.validDate(filters.from);
    const to = this.validDate(filters.to);
    if (from) query.andWhere('execution.createdAt >= :from', { from });
    if (to) query.andWhere('execution.createdAt <= :to', { to });
    const total = await query.getCount();
    const summaryQuery = query.clone();
    const data = await query
      .orderBy('execution.createdAt', 'DESC')
      .skip(Math.max(0, filters.offset ?? 0))
      .take(Math.min(200, Math.max(1, filters.limit ?? 50)))
      .getMany();
    const summaryRows = await summaryQuery
      .select('execution.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('execution.status')
      .getRawMany<{ status: string; count: string }>();
    return {
      data,
      total,
      summary: Object.fromEntries(summaryRows.map(row => [row.status, Number(row.count)])),
    };
  }

  private duration(execution: CommerceToolExecution): number {
    const started = execution.createdAt instanceof Date ? execution.createdAt.getTime() : Date.now();
    return Math.max(0, Date.now() - started);
  }

  private validDate(value: string | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
