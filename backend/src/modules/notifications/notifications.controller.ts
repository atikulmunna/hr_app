import { Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.listForUser(user.sub, user.roles);
  }

  @Post(':id/read')
  async read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.notifications.markRead(id, user.sub, user.roles);
    return { ok: true };
  }
}
