import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
@Controller('campaigns')
@RequireRole(ApiKeyRole.OPERATOR)
export class CampaignController {
  constructor(private readonly service: CampaignService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get('report') report() {
    return this.service.report();
  }
  @Get('audience') audience(@Query('sessionId') sessionId: string) {
    return this.service.audience(sessionId);
  }
  @Post() create(@Body() dto: CreateCampaignDto) {
    return this.service.create(dto);
  }
  @Post(':id/cancel') cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
