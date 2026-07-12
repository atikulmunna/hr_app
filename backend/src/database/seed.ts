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

    // Department and demo employees (linked to Keycloak users by email).
    const empCount = await m.query(`SELECT count(*)::int AS n FROM employees`);
    if (empCount[0].n === 0) {
      const sg = await m.query(
        `SELECT id FROM legal_entities WHERE country_code = 'SG' LIMIT 1`,
      );
      const sgId = sg[0].id;
      const dept = await m.query(
        `INSERT INTO departments (tenant_id, legal_entity_id, name, cost_center)
         VALUES ($1, $2, 'Engineering', 'CC-ENG') RETURNING id`,
        [tenantId, sgId],
      );
      const deptId = dept[0].id;

      const mgr = await m.query(
        `INSERT INTO employees
           (tenant_id, legal_entity_id, department_id, employee_code, first_name, last_name, email, job_title, employment_type)
         VALUES ($1, $2, $3, 'EMP-002', 'Demo', 'Manager', 'demo.manager@example.com', 'Engineering Manager', 'permanent')
         RETURNING id`,
        [tenantId, sgId, deptId],
      );
      const managerId = mgr[0].id;

      await m.query(
        `INSERT INTO employees
           (tenant_id, legal_entity_id, department_id, manager_id, employee_code, first_name, last_name, email, phone, job_title, employment_type, hire_date)
         VALUES
           ($1, $2, $3, $4, 'EMP-001', 'Ayesha', 'Rahman', 'demo.employee@example.com', '+8801700000000', 'Software Engineer', 'permanent', '2024-02-01'),
           ($1, $2, $3, NULL, 'EMP-003', 'Demo', 'Admin', 'demo.admin@example.com', NULL, 'HR Administrator', 'permanent', '2023-06-15')`,
        [tenantId, sgId, deptId, managerId],
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      `Seeded tenant "example" (${tenantId}) with entities, a department, and demo employees.`,
    );
  });
  await AppDataSource.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
