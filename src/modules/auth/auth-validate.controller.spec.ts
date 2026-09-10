import { AuthValidateController } from './auth-validate.controller';
import { ApiKeyRole } from './entities/api-key.entity';

describe('AuthValidateController', () => {
  it('returns the account attached by the JWT guard', () => {
    const controller = new AuthValidateController();
    const user = { id: 'user-1', name: 'Amine', role: ApiKeyRole.OPERATOR, plan: 'free' } as any;
    expect(controller.validate({ user } as any)).toEqual({
      valid: true,
      role: ApiKeyRole.OPERATOR,
      user: { id: 'user-1', name: 'Amine', plan: 'free' },
    });
  });
});
