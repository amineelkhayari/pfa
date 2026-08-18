import { createHmac } from 'crypto';
import { ShopifyOAuthService } from './shopify-oauth.service';
import type { Repository } from 'typeorm';
import type { ShopifyOAuthState } from '../entities/shopify-oauth-state.entity';

describe('ShopifyOAuthService', () => {
  const secret = 'test-secret';
  const repository = () => {
    let saved: Partial<ShopifyOAuthState> | undefined;
    return {
      save: jest.fn((value: Partial<ShopifyOAuthState>) => {
        saved = value;
        return Promise.resolve(value);
      }),
      findOneBy: jest.fn(({ stateHash }: { stateHash: string }) =>
        Promise.resolve(saved?.stateHash === stateHash ? saved : null),
      ),
      delete: jest.fn((criteria: { stateHash?: string }) => {
        if (criteria.stateHash && saved?.stateHash === criteria.stateHash) saved = undefined;
        return Promise.resolve({ affected: 1, raw: [] });
      }),
    } as unknown as Repository<ShopifyOAuthState>;
  };

  it('accepts a correctly signed callback and rejects tampering', () => {
    const service = new ShopifyOAuthService(repository());
    const query: Record<string, string> = {
      code: 'authorization-code',
      shop: 'demo.myshopify.com',
      state: 'oauth-state',
      timestamp: '1787000000',
    };
    const message = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    query.hmac = createHmac('sha256', secret).update(message).digest('hex');

    expect(service.verifyCallback(query, secret)).toBe(true);
    expect(service.verifyCallback({ ...query, shop: 'attacker.myshopify.com' }, secret)).toBe(false);
  });

  it('creates single-use state bound to a store', async () => {
    const service = new ShopifyOAuthService(repository());
    const state = await service.createState('store-id');

    await expect(service.consumeState(state)).resolves.toBe('store-id');
    await expect(service.consumeState(state)).rejects.toThrow('Invalid OAuth state');
  });
});
