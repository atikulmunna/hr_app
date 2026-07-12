import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Resolves a Keycloak realm slug (e.g. "example") to the tenant's UUID.
// Realm-per-tenant: the realm name equals the tenant slug.
@Injectable()
export class TenantsService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly dataSource: DataSource) {}

  async idForSlug(slug: string): Promise<string> {
    const cached = this.cache.get(slug);
    if (cached) {
      return cached;
    }
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM tenants WHERE slug = $1`,
      [slug],
    );
    if (rows.length === 0) {
      throw new UnauthorizedException(`Unknown tenant realm "${slug}".`);
    }
    const id = rows[0].id;
    this.cache.set(slug, id);
    return id;
  }
}
