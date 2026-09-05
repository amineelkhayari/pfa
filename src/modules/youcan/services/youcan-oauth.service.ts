import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { YouCanOAuthState } from '../entities/youcan-oauth-state.entity';

@Injectable()
export class YouCanOAuthService {
  constructor(@InjectRepository(YouCanOAuthState, 'data') private readonly states: Repository<YouCanOAuthState>) {}

  async createState(storeId: string) {
    const state = randomBytes(32).toString('hex');
    await this.states.delete({ expiresAt: LessThan(new Date()) });
    await this.states.save({ stateHash: this.hash(state), storeId, expiresAt: new Date(Date.now() + 10 * 60_000) });
    return state;
  }

  async consumeState(state: string) {
    const stateHash = this.hash(state);
    const row = await this.states.findOneBy({ stateHash });
    if (!row) throw new UnauthorizedException('Invalid YouCan OAuth state.');
    await this.states.delete({ stateHash });
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('YouCan OAuth state expired.');
    return row.storeId;
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
