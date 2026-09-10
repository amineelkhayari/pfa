import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyRole } from './entities/api-key.entity';
import { RequireRole, RequireUnscopedKey } from './decorators/auth.decorators';
import { AdminUpdateUserDto } from './dto/admin-user.dto';
import { UserAuthService } from './user-auth.service';
import { PlanUsageService } from './plan-usage.service';
import { ResetDatabaseDto } from './dto/reset-database.dto';
import { AdminDatabaseResetService } from './admin-database-reset.service';
import { UserAccount } from './entities/user-account.entity';

@Controller('admin/users')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminUsersController {
  constructor(private readonly users: UserAuthService, private readonly usage: PlanUsageService, private readonly databaseReset: AdminDatabaseResetService) {}

  @Get()
  list() {
    return this.users.adminList();
  }

  @Get('summary')
  summary() {
    return this.users.adminSummary();
  }

  @Get('resources')
  resources() { return this.usage.getAdminResourceTotals(); }

  @Get(':id/details')
  details(@Param('id') id: string) { return this.usage.getAdminUserDetails(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.users.adminUpdate(id, dto);
  }

  @Post('maintenance/reset-database')
  resetDatabase(@Req() request: Request & { user?: UserAccount }, @Body() dto: ResetDatabaseDto) {
    if (!request.user) throw new Error('Authenticated administrator missing');
    return this.databaseReset.reset(request.user.id, dto.password, dto.confirmation);
  }
}
