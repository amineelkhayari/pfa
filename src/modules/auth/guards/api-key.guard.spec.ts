import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyRole } from '../entities/api-key.entity';
import { PUBLIC_KEY, REQUIRED_ROLE_KEY, SESSION_SCOPED_KEY } from '../decorators/auth.decorators';

function context(headers: Record<string, string> = {}, params: Record<string, string> = {}) {
  const request = {
    headers,
    params,
    path: '/api/sessions',
    method: 'GET',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
  return {
    request,
    value: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext,
  };
}

describe('JWT-only global auth guard', () => {
  const user = { id: 'user-1', role: ApiKeyRole.OPERATOR, status: 'active' } as any;
  function build(metadata: Record<string, unknown> = {}, ownsSession = true) {
    const reflector = { getAllAndOverride: jest.fn((key: string) => metadata[key]) };
    const users = { validateToken: jest.fn().mockResolvedValue(user) };
    const sessions = { existsBy: jest.fn().mockResolvedValue(ownsSession) };
    const guard = new ApiKeyGuard(
      {} as any,
      reflector as any,
      { get: jest.fn().mockReturnValue([]) } as any,
      { logWarn: jest.fn().mockResolvedValue(null) } as any,
      users as any,
      sessions as any,
    );
    return { guard, users, sessions };
  }

  it('allows public routes without authentication', async () => {
    const { guard, users } = build({ [PUBLIC_KEY]: true });
    await expect(guard.canActivate(context().value)).resolves.toBe(true);
    expect(users.validateToken).not.toHaveBeenCalled();
  });

  it('requires a Bearer JWT', async () => {
    const { guard } = build();
    await expect(guard.canActivate(context().value)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects legacy X-API-Key credentials', async () => {
    const { guard, users } = build();
    await expect(guard.canActivate(context({ 'x-api-key': 'legacy-key' }).value)).rejects.toThrow(
      'Bearer JWT access token is required',
    );
    expect(users.validateToken).not.toHaveBeenCalled();
  });

  it('accepts a valid account JWT and attaches its user', async () => {
    const { guard, users } = build({ [REQUIRED_ROLE_KEY]: ApiKeyRole.VIEWER });
    const request = context({ authorization: 'Bearer jwt-token' });
    await expect(guard.canActivate(request.value)).resolves.toBe(true);
    expect(users.validateToken).toHaveBeenCalledWith('jwt-token');
    expect((request.request as any).user).toBe(user);
  });

  it('enforces account roles', async () => {
    const { guard } = build({ [REQUIRED_ROLE_KEY]: ApiKeyRole.ADMIN });
    await expect(guard.canActivate(context({ authorization: 'Bearer jwt-token' }).value)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('enforces ownership for session-scoped routes', async () => {
    const { guard, sessions } = build({ [SESSION_SCOPED_KEY]: true }, false);
    const request = context({ authorization: 'Bearer jwt-token' }, { id: 'session-2' });
    await expect(guard.canActivate(request.value)).rejects.toThrow(ForbiddenException);
    expect(sessions.existsBy).toHaveBeenCalledWith({ id: 'session-2', userId: 'user-1' });
  });
});
