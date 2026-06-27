# Tasks: Harden MVP Deployment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–1000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 migrations → PR 2 runtime → PR 3 concurrency + verification |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Database lifecycle: committed migrations, schema contract, baseline/verify commands | PR 1 | Targets feature/mvp-deploy-hardening; includes migration metadata tests |
| 2 | Production runtime: env validation, build checks, pool, health, boot | PR 2 | Targets feature branch after PR 1; unit tests included |
| 3 | Concurrent solicitud creation + release verification | PR 3 | Targets feature branch after PR 2; tests included |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Update `app/.gitignore` to allow `app/db/migrations/*.sql` while ignoring local databases.
- [x] 1.2 Name the solicitud PIN unique index in `app/db/schema.ts`.
- [x] 1.3 Create baseline migration SQL and Drizzle metadata under `app/db/migrations`.
- [x] 1.4 Configure `app/drizzle.config.ts` with migration credentials and journal table.
- [x] 1.5 Create `app/scripts/schema-contract.mjs` with read-only schema compare and guarded baseline.
- [x] 1.6 Add `db:verify` and `db:baseline` scripts to `app/package.json`.
- [x] 1.7 Update `app/.env.example` with runtime and migration variables.

## Phase 2: Core Implementation

- [x] 2.1 Add Zod parsing for backend env to `app/api/lib/env.ts`.
- [x] 2.2 Fail production builds missing `VITE_KIMI_AUTH_URL` or `VITE_APP_ID` in `app/vite.config.ts`.
- [x] 2.3 Replace `app/api/queries/connection.ts` with a bounded `mysql2/promise` pool and ping/close helpers.
- [x] 2.4 Create `app/api/queries/create-solicitud.ts` with `crypto.randomInt`, direct insert, duplicate classification, and bounded retry.
- [x] 2.5 Update `app/api/solicitudes-router.ts` to use the safe create helper.
- [x] 2.6 Remove production JWT-secret fallback from `app/api/local-auth-router.ts`.
- [x] 2.7 Update `app/api/boot.ts` to validate env, ping the pool, and expose readiness failure.
- [x] 2.8 Create `app/api/lib/health.ts` with `GET /health/live` and `GET /health/ready` and wire it into the app router.

## Phase 3: Testing / Verification

- [x] 3.1 Add unit tests for env parsing in `app/api/lib/env.test.ts`.
- [x] 3.2 Add unit tests for schema compare and baseline preconditions in `app/scripts/schema-contract.test.ts`.
- [x] 3.3 Add tests for health/live/ready and boot failure in `app/api/lib/health.test.ts`.
- [x] 3.4 Add concurrency tests for unique PIN allocation and retry exhaustion in `app/api/queries/create-solicitud.test.ts`.
- [x] 3.5 Add `app/vitest.integration.config.ts` and integration tests for migrations, drift, baseline, auth, and parallel creates.
- [x] 3.6 Add `release:verify` script to `app/package.json` and ensure it runs build, history check, tests, integration tests, and `db:verify`.

## Phase 4: Cleanup / Docs

- [x] 4.1 Update `app/README.md` with env vars, migration workflow, TLS/backup notes, baselining, and health endpoints.
- [x] 4.2 Remove dead check-then-insert PIN code and stale migration ignores.
- [x] 4.3 Run `npm run release:verify` end-to-end and fix any failures.
