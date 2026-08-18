import { Controller, Post, HttpCode, HttpStatus, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { CurrentApiKey } from './decorators/auth.decorators';
import { ApiKey } from './entities/api-key.entity';
import { UserAccount } from './entities/user-account.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthValidateController {
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an API key' })
  @ApiHeader({ name: 'X-API-Key', description: 'API key to validate' })
  @ApiResponse({ status: 200, description: 'API key is valid' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  validate(
    @CurrentApiKey() apiKey?: ApiKey,
    @Req() request?: Request & { user?: UserAccount },
  ): { valid: boolean; role?: string; user?: { id: string; name: string; plan: string | null } } {
    // This route is behind the global API-key guard, so only a validated key reaches this handler
    // (a missing/invalid key 401s first). The guard has already verified the key — including its
    // client-IP and session-scope restrictions — and attached it to the request. Re-validating here
    // would repeat that work without the client IP, double-counting usage and, for an IP-restricted
    // key, failing closed (no IP) and wrongly reporting valid:false. So we trust the guard's result.
    // The valid:false branch is unreachable in normal operation; it's retained as defense-in-depth in
    // case the guard config ever changes, keeping the endpoint safe to expose directly.
    if (request?.user) {
      return {
        valid: true,
        role: request.user.role,
        user: { id: request.user.id, name: request.user.name, plan: request.user.plan },
      };
    }
    if (!apiKey) return { valid: false };
    return { valid: true, role: apiKey.role };
  }
}
