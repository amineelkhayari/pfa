import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequireRole, RequireUnscopedKey } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { CommerceExecutionLogService } from '../services/commerce-execution-log.service';

@ApiTags('admin-commerce-automation')
@Controller('admin/commerce-executions')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminCommerceExecutionsController {
  constructor(private readonly executions: CommerceExecutionLogService) {}

  @Get()
  @ApiOperation({ summary: 'List commerce AI and provider action executions' })
  @ApiQuery({ name: 'status', required: false, enum: ['started', 'succeeded', 'failed', 'uncertain'] })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'tool', required: false })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  list(
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('storeId') storeId?: string,
    @Query('tool') tool?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.executions.list({
      status,
      provider,
      storeId,
      tool,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
