import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UserAccount } from '../auth/entities/user-account.entity';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}
  @Get() list(@Req() req: Request & { user?: UserAccount }) {
    return this.service.listForUser(req.user!.id);
  }
  @Post('read-all') markAll(@Req() req: Request & { user?: UserAccount }) {
    return this.service.markAllRead(req.user!.id);
  }
  @Post(':id/read') markRead(@Req() req: Request & { user?: UserAccount }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(req.user!.id, id);
  }
}
