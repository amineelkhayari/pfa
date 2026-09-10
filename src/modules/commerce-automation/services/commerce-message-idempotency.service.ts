import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CommerceMessageReceipt } from '../../stores/entities/commerce-message-receipt.entity';

@Injectable()
export class CommerceMessageIdempotencyService {
  private readonly staleAfterMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(CommerceMessageReceipt, 'data')
    private readonly receipts: Repository<CommerceMessageReceipt>,
  ) {}

  async claim(sessionId: string, messageId: string | undefined): Promise<boolean> {
    if (!messageId) return true;
    try {
      await this.receipts.insert({ sessionId, messageId, status: 'processing' });
      return true;
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
    }

    const staleBefore = new Date(Date.now() - this.staleAfterMs);
    const result = await this.receipts.update(
      { sessionId, messageId, status: 'processing', updatedAt: LessThan(staleBefore) },
      { updatedAt: new Date() },
    );
    return (result.affected ?? 0) === 1;
  }

  async complete(sessionId: string, messageId: string | undefined): Promise<void> {
    if (!messageId) return;
    await this.receipts.update({ sessionId, messageId }, { status: 'completed' });
  }

  async release(sessionId: string, messageId: string | undefined): Promise<void> {
    if (!messageId) return;
    await this.receipts.delete({ sessionId, messageId, status: 'processing' });
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error ? String(error.code) : '';
    return code === '23505' || code === 'SQLITE_CONSTRAINT' || code === 'SQLITE_CONSTRAINT_UNIQUE';
  }
}
