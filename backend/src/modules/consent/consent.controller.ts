import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ConsentService, PublishStatementInput } from './consent.service';

interface GrantBody {
  platform?: string;
  version?: number;
}

// Consent capture and purpose statements (T-1F.1). Admins publish and list
// statements; employees read the active statement for their platform and grant
// consent before marking.
@Controller()
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @RequirePermissions('consent:manage')
  @Post('consent/statements')
  publish(@Body() body: PublishStatementInput, @CurrentUser() user: AuthUser) {
    return this.consent.publish(body, user.sub);
  }

  @RequirePermissions('consent:manage')
  @Get('consent/statements')
  list() {
    return this.consent.listStatements();
  }

  @Get('me/consent')
  mine(@CurrentUser() user: AuthUser, @Query('platform') platform: string) {
    return this.consent.myConsent(user, platform);
  }

  @Post('me/consent')
  grant(@CurrentUser() user: AuthUser, @Body() body: GrantBody) {
    return this.consent.grant(user, body?.platform, body?.version);
  }
}
