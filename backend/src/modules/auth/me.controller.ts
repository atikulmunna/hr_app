import { Controller, Get } from '@nestjs/common';
import { AuthUser, CurrentUser } from './current-user.decorator';

@Controller('auth')
export class MeController {
  // Returns the authenticated caller's identity, roles, and resolved tenant.
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
