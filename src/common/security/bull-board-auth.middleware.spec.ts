import { BullBoardAuthMiddleware } from './bull-board-auth.middleware';
import { ApiKeyRole } from '../../modules/auth/entities/api-key.entity';

describe('BullBoardAuthMiddleware JWT authentication', () => {
  const response = {} as any;
  const request = (headers: Record<string, string> = {}, method = 'GET') =>
    ({
      headers,
      method,
      path: '/api/admin/queues',
      originalUrl: '/api/admin/queues',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    }) as any;

  function build(role: ApiKeyRole = ApiKeyRole.ADMIN) {
    const users = { validateToken: jest.fn().mockResolvedValue({ id: 'user-1', role }) };
    const audit = { logInfo: jest.fn().mockResolvedValue(null), logWarn: jest.fn().mockResolvedValue(null) };
    const middleware = new BullBoardAuthMiddleware(
      users as any,
      { get: jest.fn().mockReturnValue([]) } as any,
      audit as any,
    );
    return { middleware, users, audit };
  }

  it('rejects requests without a Bearer JWT', async () => {
    const { middleware } = build();
    const next = jest.fn();
    await middleware.use(request(), response, next);
    expect(next.mock.calls[0][0]?.status).toBe(401);
  });

  it('does not accept X-API-Key', async () => {
    const { middleware, users } = build();
    const next = jest.fn();
    await middleware.use(request({ 'x-api-key': 'legacy' }), response, next);
    expect(next.mock.calls[0][0]?.status).toBe(401);
    expect(users.validateToken).not.toHaveBeenCalled();
  });

  it('accepts an administrator JWT', async () => {
    const { middleware, users } = build();
    const next = jest.fn();
    await middleware.use(request({ authorization: 'Bearer jwt-token' }), response, next);
    expect(users.validateToken).toHaveBeenCalledWith('jwt-token');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a non-administrator JWT', async () => {
    const { middleware } = build(ApiKeyRole.OPERATOR);
    const next = jest.fn();
    await middleware.use(request({ authorization: 'Bearer jwt-token' }), response, next);
    expect(next.mock.calls[0][0]?.status).toBe(403);
  });
});
