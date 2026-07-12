import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

// Establishes the tenant for the request. Authentication is built in T-0.4;
// until then the tenant is taken from the x-tenant-id header for development.
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly ctx: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = req.header('x-tenant-id') ?? undefined;
    this.ctx.run(tenantId, () => next());
  }
}
