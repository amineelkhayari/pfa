import { AuditController } from './audit.controller';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AuditService } from './audit.service';
import type { Request } from 'express';
import { UserAccount } from '../auth/entities/user-account.entity';

describe('AuditController access control', () => {
  const findAll = jest.fn().mockResolvedValue({ data: [], total: 0 });
  const controller = new AuditController({ findAll } as unknown as AuditService);
  const req = (user: Partial<UserAccount>) => ({ user }) as Request & { user?: UserAccount };

  beforeEach(() => findAll.mockClear());

  it('forces a customer query to the authenticated account', async () => {
    await controller.findAll(
      req({ id: 'u1', role: ApiKeyRole.OPERATOR }),
      undefined,
      undefined,
      undefined,
      undefined,
      'u2',
    );
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  it('lets an administrator read the global trail', async () => {
    await controller.findAll(req({ id: 'admin', role: ApiKeyRole.ADMIN }));
    expect(findAll).toHaveBeenCalledWith(expect.not.objectContaining({ userId: expect.anything() }));
  });

  it('lets an administrator narrow the global trail to one account', async () => {
    await controller.findAll(
      req({ id: 'admin', role: ApiKeyRole.ADMIN }),
      undefined,
      undefined,
      undefined,
      undefined,
      'u2',
    );
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2' }));
  });
});
