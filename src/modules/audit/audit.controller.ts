import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService, AuditQueryOptions } from './audit.service';
import { AuditLog, AuditAction, AuditSeverity } from './entities/audit-log.entity';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { UserAccount } from '../auth/entities/user-account.entity';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiBearerAuth('account-jwt')
  @ApiOperation({ summary: 'List audit logs with optional filters' })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'severity', required: false, enum: AuditSeverity })
  @ApiQuery({ name: 'sessionId', required: false })
  @ApiQuery({ name: 'apiKeyId', required: false })
  @ApiQuery({ name: 'userId', required: false, description: 'Administrator only: narrow the global log to one user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of audit logs',
  })
  async findAll(
    @Req() request: Request & { user?: UserAccount },
    @Query('action') action?: AuditAction,
    @Query('severity') severity?: AuditSeverity,
    @Query('sessionId') sessionId?: string,
    @Query('apiKeyId') apiKeyId?: string,
    @Query('userId') requestedUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const user = request.user;
    if (!user) throw new UnauthorizedException('A user login token is required');
    const options: AuditQueryOptions = {};
    if (action) options.action = action;
    if (severity) options.severity = severity;
    if (sessionId) options.sessionId = sessionId;
    if (apiKeyId) options.apiKeyId = apiKeyId;
    // Administrators see the global trail and may narrow it to one account. Every other role is
    // forcibly scoped to its own user id; a forged ?userId= query can never widen the result.
    if (user.role === ApiKeyRole.ADMIN) {
      if (requestedUserId) options.userId = requestedUserId;
    } else {
      options.userId = user.id;
    }
    if (limit) options.limit = parseInt(limit, 10);
    if (offset) options.offset = parseInt(offset, 10);

    return this.auditService.findAll(options);
  }
}
