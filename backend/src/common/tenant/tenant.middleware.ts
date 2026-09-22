import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

// Opens the per-request async-local store that holds the tenant and actor.
// It starts empty: JwtAuthGuard fills it from the verified token, so the tenant
// is never taken from anything the caller sends.
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly ctx: TenantContextService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.ctx.run(undefined, () => next());
  }
}
