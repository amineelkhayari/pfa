import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiKeyRole } from './entities/api-key.entity';
import { RequireRole, RequireUnscopedKey } from './decorators/auth.decorators';
import { AdminUpdateUserDto } from './dto/admin-user.dto';
import { UserAuthService } from './user-auth.service';
import { PlanUsageService } from './plan-usage.service';

@Controller('admin/users')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class AdminUsersController {
  constructor(private readonly users: UserAuthService, private readonly usage: PlanUsageService) {}

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
}
