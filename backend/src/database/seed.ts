import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { AppDataSource } from './data-source';

loadEnv();

// Seeds the Example Corp tenant with its Singapore and Bangladesh legal entities.
// Idempotent: safe to run repeatedly.
async function seed(): Promise<void> {
  await AppDataSource.initialize();
  await AppDataSource.transaction(async (m) => {
    const existing = await m.query(`SELECT id FROM tenants WHERE slug = 'example'`);
    let tenantId: string;
    if (existing.length > 0) {
      tenantId = existing[0].id;
    } else {
      const rows = await m.query(
        `INSERT INTO tenants (slug, name) VALUES ('example', 'Example Corp') RETURNING id`,
      );
      tenantId = rows[0].id;
    }

    // Row-level security requires the tenant setting before touching legal_entities.
    await m.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
      tenantId,
    ]);

    const count = await m.query(
      `SELECT count(*)::int AS n FROM legal_entities`,
    );
    if (count[0].n === 0) {
      await m.query(
        `INSERT INTO legal_entities (tenant_id, name, country_code, currency_code, residency_region)
         VALUES ($1, 'Example Corp Singapore', 'SG', 'SGD', 'default'),
                ($1, 'Example Corp Bangladesh', 'BD', 'BDT', 'default')`,
        [tenantId],
      );
    }

    // eslint-disable-next-line no-console
    console.log(`Seeded tenant "example" (${tenantId}) with SG and BD entities.`);
  });
  await AppDataSource.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
