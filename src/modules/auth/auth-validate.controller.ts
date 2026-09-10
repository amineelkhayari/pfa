import { Controller, Post, HttpCode, HttpStatus, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserAccount } from './entities/user-account.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthValidateController {
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate the current account JWT' })
  @ApiBearerAuth('account-jwt')
  @ApiResponse({ status: 200, description: 'JWT is valid' })
  @ApiResponse({ status: 401, description: 'Invalid or missing JWT' })
  validate(@Req() request: Request & { user?: UserAccount }): {
    valid: boolean;
    role: string;
    user: { id: string; name: string; plan: string | null };
  } {
    const user = request.user!;
    return { valid: true, role: user.role, user: { id: user.id, name: user.name, plan: user.plan } };
  }
}
