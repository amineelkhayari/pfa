import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { ShopifyOAuthState } from '../entities/shopify-oauth-state.entity';

@Injectable()
export class ShopifyOAuthService {
  constructor(
    @InjectRepository(ShopifyOAuthState, 'data')
    private readonly stateRepository: Repository<ShopifyOAuthState>,
  ) {}

  async createState(storeId: string): Promise<string> {
    const state = randomBytes(32).toString('hex');
    await this.stateRepository.delete({ expiresAt: LessThan(new Date()) });
    await this.stateRepository.save({
      stateHash: this.hash(state),
      storeId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return state;
  }

  async consumeState(state: string): Promise<string> {
    const stateHash = this.hash(state);
    const data = await this.stateRepository.findOneBy({ stateHash });
    if (!data) throw new UnauthorizedException('Invalid OAuth state.');
    await this.stateRepository.delete({ stateHash });
    if (Date.now() > data.expiresAt.getTime()) throw new UnauthorizedException('OAuth state expired.');
    return data.storeId;
  }

  verifyCallback(query: Record<string, unknown>, clientSecret: string): boolean {
    const received = typeof query.hmac === 'string' ? query.hmac : '';
    if (!received || !/^[a-f0-9]{64}$/i.test(received)) return false;
    const message = Object.entries(query)
      .filter(([key]) => key !== 'hmac' && key !== 'signature')
      .filter(([, value]) => typeof value === 'string')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value as string}`)
      .join('&');
    const expected = createHmac('sha256', clientSecret).update(message).digest('hex');
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  }

  verifyWebhook(rawBody: Buffer, received: string | undefined, clientSecret: string): boolean {
    if (!received) return false;
    const expected = createHmac('sha256', clientSecret).update(rawBody).digest('base64');
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private hash(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }
}
