# HRIS Platform

Multi-tenant HRIS platform with mobile attendance and verification, for a fictional Example Corp.

Stack: Flutter (mobile), React + TypeScript (web, added later), Node/TypeScript NestJS (backend), PostgreSQL.

## Monorepo layout

- `backend/` NestJS API, workflow engine, scoring, jobs.
- `packages/` shared TypeScript packages (added later).
- `web/` React console (added later).
- `mobile/` Flutter employee app (added later).
- `infra/` Docker Compose and infrastructure config.

## Local development

Prerequisites: Node 20+ (24 tested), pnpm 11+, Docker Desktop (for Postgres).

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Start Postgres (requires Docker Desktop running)
pnpm db:up

# 3. Configure backend env
cp backend/.env.example backend/.env

# 4. Run migrations and seed
pnpm backend:migrate
pnpm backend:seed

# 5. Start the backend
pnpm backend:dev
```

Backend runs at `http://localhost:3000/api/v1`.

- Health (public): `GET /api/v1/health`
- Current user: `GET /api/v1/auth/me` (requires a bearer token)
- Tenant-scoped entities: `GET /api/v1/entities` (requires a bearer token)

Tenant isolation is enforced by Postgres row-level security keyed on the
`app.current_tenant_id` session setting, applied per request via the tenant
context and `TenantDbService`.

## Authentication (Keycloak)

`pnpm db:up` also starts Keycloak and its database.

- Admin console: `http://localhost:8080` (admin / admin).
- Realm: `example` (realm-per-tenant; realm name maps to the tenant slug).
- Demo user: `demo.employee` / `demo123` (role `employee`).

The backend validates Keycloak-issued JWTs against the realm JWKS, resolves the
tenant from the realm, and sets the tenant context automatically, so requests
need only a bearer token (no `x-tenant-id` header).

Get a token and call a protected endpoint:

```bash
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/example/protocol/openid-connect/token \
  -d grant_type=password -d client_id=hris-mobile \
  -d username=demo.employee -d password=demo123 | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/entities
```
