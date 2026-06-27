# EmergenciaMed — Deployment Guide

This app is a React + Hono + tRPC service backed by MySQL. The
deployment guide covers what changed in the MVP hardening change:
env validation, versioned migrations, schema contract verification,
liveness/readiness probes, and the release verification gate.

## Quick path

1. Set required env vars (see [Environment](#environment)).
2. Run `npm run db:migrate` to apply committed migrations.
3. Run `npm run release:verify` to prove the build is shippable.
4. Start the app: `npm run start` (or your platform's process manager).

`release:verify` runs `build` → `unit tests` → `integration tests`
→ `db:verify`. The `db:verify` step needs a live MySQL pair; if
they are missing, the script exits with a clear env error and the
rest of the chain is preserved (see [Release verification](#release-verification)).

## Environment

All variables are validated at boot. Missing or invalid values fail
fast with a message that names the offending field.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | MySQL connection string for the target database |
| `SCHEMA_REFERENCE_DATABASE_URL` | for `db:verify` and `db:baseline` | Migrated reference database used to detect schema drift |
| `APP_ID` | yes | Application identifier (server-side) |
| `APP_SECRET` | yes | Secret used to sign local-auth JWTs |
| `KIMI_AUTH_URL` | yes | OAuth server URL (server-side) |
| `KIMI_OPEN_URL` | yes | Open Platform URL (server-side) |
| `VITE_KIMI_AUTH_URL` | yes at build time | OAuth server URL exposed to the browser |
| `VITE_APP_ID` | yes at build time | OAuth application ID exposed to the browser |
| `OWNER_UNION_ID` | no | First-time admin union id (empty string by default) |
| `PORT` | no | HTTP port (default `3000`, range `1`–`65535`) |
| `DB_POOL_LIMIT` | no | mysql2 connection limit (default `10`, range `1`–`100`) |
| `DB_QUEUE_LIMIT` | no | mysql2 queue limit (default `0`, range `0`–`10000`) |
| `DB_CONNECT_TIMEOUT_MS` | no | mysql2 connect timeout (default `10000`) |
| `DB_IDLE_TIMEOUT_MS` | no | mysql2 idle timeout (default `60000`) |

Runtime uses a separate credential from the migration runner in
production. See [.env.example](./.env.example) for a copy-paste
template.

## Migration workflow

Migrations live in `db/migrations/`. The runner is `drizzle-kit migrate`,
which reads `drizzle.config.ts` and records applied migrations in the
journal table `__drizzle_migrations`.

```bash
# Generate a new migration after editing db/schema.ts
npm run db:generate

# Apply pending migrations to the target database
npm run db:migrate
```

The first time you adopt an existing database that is not yet tracked
by Drizzle, run the guarded baselining flow below.

## Schema contract (drift + baseline)

Two CLI commands enforce that the committed migration history and the
deployed schema agree:

```bash
# Compare the target database against a migrated reference.
# Reads DATABASE_URL and SCHEMA_REFERENCE_DATABASE_URL.
npm run db:verify

# Register the committed baseline as already applied. Requires --confirm
# and a non-empty Drizzle journal on the target.
npm run db:baseline -- --confirm
```

`db:verify` reports "no diffs" when both databases match and prints
the offending tables/columns/indexes otherwise. It ignores the
migration journal and volatile auto-increment counters.

`db:baseline` first runs the same comparison, then refuses to
proceed if the journal is not empty or the schema does not match.
The flow never executes baseline DDL against the target — it only
records migration hashes, mirroring what `drizzle-kit migrate` would
have done if the migrations had been applied historically.

## Release verification

`npm run release:verify` is the gate for shipping a build. It runs:

1. `npm run build` — production Vite build + esbuild server bundle.
2. `npm test` — Vitest unit suite (mocked, no database required).
3. `npm run test:integration` — Vitest integration suite (structural,
   no live database required by default; can be extended to drive
   disposable MySQL).
4. `npm run db:verify` — live schema verification; requires
   `DATABASE_URL` and `SCHEMA_REFERENCE_DATABASE_URL`.

The `db:verify` step exits with a clear "Missing required environment
variables" message if the env is not set, so the rest of the chain
keeps the same surface and a CI run can point at the missing variable
without parsing a stack trace.

## Health endpoints

| Endpoint | Status | When to use |
|----------|--------|-------------|
| `GET /health/live` | always 200 | Liveness probe — describes the process, not its dependencies |
| `GET /health/ready` | 200 if DB ping succeeds, 503 otherwise | Readiness probe — admit traffic only when the database is reachable |

The application refuses to start serving traffic until the boot path
has run `parseEnv` (production) and `pingDb`. See
`api/boot.ts` for the wiring.

## Operational notes

- **TLS** — terminate TLS at the edge (load balancer or reverse
  proxy). mysql2 connections to managed MySQL should be configured
  with TLS at the provider; the connection string accepts the
  standard `?ssl-mode=...` parameters.
- **Backups** — run automated backups on the managed MySQL
  instance. Do not down-migrate destructive DDL — restore from
  backup instead. The migration workflow assumes forward-only
  changes.
- **Connection separation** — production should use two sets of
  credentials: a runtime user with limited DML privileges for
  `DATABASE_URL`, and a migration user with DDL for
  `SCHEMA_REFERENCE_DATABASE_URL` and the migration runner.

## Next step

After `release:verify` passes, deploy the artifact and admit
traffic only after `/health/ready` returns `200 {"status":"ready"}`.
