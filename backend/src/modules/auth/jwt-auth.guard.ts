import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { AuthUser } from './current-user.decorator';
import { KeycloakService } from './keycloak.service';
import { permissionsForRoles } from './permissions';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantsService } from './tenants.service';

// Global guard. Verifies the bearer token, resolves the tenant from the realm,
// sets the tenant context, and attaches the user to the request.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloak: KeycloakService,
    private readonly tenants: TenantsService,
    private readonly ctx: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const auth = req.header('authorization') ?? '';
    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Bearer token required.');
    }

    const { realm, claims } = await this.keycloak.verify(token);
    const tenantId = await this.tenants.idForSlug(realm);
    this.ctx.setTenantId(tenantId);

    const roles = claims.realm_access?.roles ?? [];
    this.ctx.setActor({
      sub: claims.sub,
      username: claims.preferred_username,
      roles,
    });
    req.user = {
      sub: claims.sub,
      username: claims.preferred_username,
      email: claims.email,
      roles,
      permissions: permissionsForRoles(roles),
      tenantId,
      realm,
    };
    return true;
  }
}
