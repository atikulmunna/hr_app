import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from './current-user.decorator';
import { ROLES_KEY } from './roles.decorator';

// Runs after JwtAuthGuard. Enforces @Roles(...) when present; a route with no
// @Roles decorator only requires authentication.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const roles = req.user?.roles ?? [];
    if (!required.some((r) => roles.includes(r))) {
      throw new ForbiddenException('Insufficient role.');
    }
    return true;
  }
}
