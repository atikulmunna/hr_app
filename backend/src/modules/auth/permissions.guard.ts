import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from './current-user.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { hasPermission } from './permissions';

// Runs after JwtAuthGuard and RolesGuard. Enforces @RequirePermissions(...) when
// present; a route with none only requires authentication.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const perms = req.user?.permissions ?? [];
    const ok = required.every((p) => hasPermission(perms, p));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions.');
    }
    return true;
  }
}
