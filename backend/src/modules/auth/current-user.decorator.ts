import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthUser {
  sub?: string;
  username?: string;
  email?: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
  realm: string;
}

// Injects the authenticated user set by JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return req.user;
  },
);
