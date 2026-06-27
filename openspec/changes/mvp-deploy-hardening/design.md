# Design: Harden MVP Deployment

## Technical Approach

Keep Hono/tRPC, MySQL, and Drizzle. Check in a baseline, add an executable schema contract, validate backend startup and frontend build configuration, and replace PIN check-then-insert with database uniqueness plus bounded retries. Release verification adds disposable MySQL to the existing Vitest setup.

## Architecture Decisions

| Decision | Alternatives / tradeoff | Choice and rationale |
|---|---|---|
| Migration history | `db:push` is unversioned; `drizzle-kit check` validates migration-file history but not a live database | Remove `db/migrations/*.sql` from `app/.gitignore`, commit SQL and metadata, run `drizzle-kit check`, then `drizzle-kit migrate`. Add a separate live-schema verifier so committed history and deployed state are both checked. |
| Existing database adoption | Applying baseline DDL risks data; accepting unverified state hides drift | Compare the target read-only against a disposable migrated reference. Only an exact match may register the baseline in Drizzle's journal. |
| Database connection | URL-only Drizzle initialization hides pool policy | Build one bounded `mysql2/promise` pool in `app/api/queries/connection.ts` with validated limits/timeouts and ping/close helpers. |
| PIN allocation | Pre-selecting races; broad locks serialize unrelated creates | Keep a named unique index, generate six digits with `crypto.randomInt`, insert directly, and retry only MySQL duplicate-key failures up to a fixed limit. |
| Configuration boundary | Backend validation cannot detect missing Vite replacements | Validate server variables before startup and require `VITE_KIMI_AUTH_URL` plus `VITE_APP_ID` during production builds. Document runtime secrets versus public build inputs. |
| Verification split | Unit tests cannot prove migrations or concurrency | Keep fast mocked unit tests and add an opt-in, release-required disposable-MySQL suite. |

## Data Flow

```text
release -> build-env check -> drizzle check -> migrate reference
        -> compare reference information_schema to target -> migrate/start

startup -> validate server env -> pool ping -> listen -> readiness
request -> generate PIN -> INSERT -> duplicate key -> bounded retry
```

## File Changes

| File | Action | Description |
|---|---|---|
| `app/.gitignore` | Modify | Remove `db/migrations/*.sql` so migration SQL is committable; retain local database ignores. |
| `app/db/schema.ts` | Modify | Give the solicitud PIN unique index a stable name. |
| `app/db/migrations/0000_*.sql`, `app/db/migrations/meta/*` | Create | Baseline and Drizzle metadata. |
| `app/drizzle.config.ts` | Modify | Require migration credentials and explicitly configure the journal table used by migration and baseline registration. |
| `app/scripts/schema-contract.mjs` | Create | Implement read-only live-schema comparison and guarded baseline registration. |
| `app/api/lib/env.ts` | Modify | Add testable Zod parsing for backend URLs, secrets, port, pool, and timeouts. |
| `app/vite.config.ts` | Modify | Use `loadEnv` to fail production builds missing/invalid `VITE_KIMI_AUTH_URL` or `VITE_APP_ID`. |
| `app/api/queries/connection.ts` | Modify | Own the bounded pool and ping/close helpers. |
| `app/api/queries/create-solicitud.ts` | Create | Encapsulate secure PIN generation, duplicate classification, and retry. |
| `app/api/solicitudes-router.ts`, `app/api/local-auth-router.ts` | Modify | Use safe creation; remove the production JWT-secret fallback. |
| `app/api/boot.ts`, `app/api/lib/health.ts` | Modify/Create | Validate dependencies before listening and expose liveness/readiness. |
| `app/package.json`, `app/.env.example`, `app/README.md` | Modify | Add commands and document runtime/build variables, TLS, backup, and baselining. |
| `app/vitest.config.ts`, `app/vitest.integration.config.ts`, `app/api/**/*.test.ts`, `app/scripts/**/*.test.ts` | Modify/Create | Cover configuration, health, schema contract, auth, migrations, and concurrent creates. |

## Interfaces / Contracts

- Backend runtime requires `DATABASE_URL`, `APP_ID`, `APP_SECRET`, `KIMI_AUTH_URL`, and `KIMI_OPEN_URL`; pool/timeouts and `PORT` are bounded integers. Production frontend build requires valid `VITE_KIMI_AUTH_URL` and non-empty `VITE_APP_ID`.
- `npm run db:verify` compares normalized `information_schema` tables, columns, indexes, and foreign keys between `DATABASE_URL` and migrated `SCHEMA_REFERENCE_DATABASE_URL`, ignoring only the migration journal and volatile auto-increment counters. Diffs print both sides and exit nonzero without target writes.
- `npm run db:baseline -- --confirm` first runs the same exact comparison, requires an empty migration journal, then records every committed migration using its SQL SHA-256 and `meta/_journal.json` timestamp in one guarded operation. It never executes baseline schema DDL.
- `GET /health/live` checks only process liveness. `GET /health/ready` returns `200 {"status":"ready"}` after a database ping or `503`.
- Solicitud creation keeps `{ id, pinGestion }`; retry exhaustion returns tRPC `CONFLICT`.

## Testing Strategy

Unit tests cover env/build parsing, schema diffs, baseline preconditions, health, and retry bounds. Integration tests migrate two empty databases; reject column/index drift; baseline an identical untracked database and run the next migration once; exercise auth and parallel creates. `npm run release:verify` runs build, history check, tests, integration tests, and live-schema verification.

## Migration / Rollout

1. Generate/review the baseline and verify it on two empty disposable databases.
2. Provision managed MySQL with TLS, backups, and separate runtime/migration credentials.
3. For an existing untracked database: freeze writes, back up, migrate an empty reference, run `db:verify`, then run guarded `db:baseline`; any diff blocks rollout.
4. Run migrations, deploy, and admit traffic only after readiness. Roll back the artifact independently; restore backup rather than down-migrating destructive DDL.

## Open Questions

None blocking.
