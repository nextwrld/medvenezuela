# Tasks: Restricted Solicitud Closure

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~900–1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Schema, migration, and closure-security helpers | PR 1 | Includes Drizzle snapshot; base branch |
| 2 | Router + query logic for split PINs and admin override | PR 2 | Depends on unit 1 |
| 3 | UI pages (creator success, public detail, management close) | PR 3 | Depends on units 1–2 |
| 4 | Unit/router/UI tests | PR 4 | Depends on units 1–3 |

## Phase 1: Foundation

- [x] 1.1 Add `pinCierre`, `notasCierre`, `closedAt`, audit table `solicitudClosureAudit`, and attempt table `solicitudClosureAttempts` to `app/db/schema.ts`.
- [x] 1.2 Create `app/db/migrations/0001_restricted_solicitud_closure.sql` with columns, tables, indexes, and backfill-safe steps.
- [x] 1.3 Generate `app/db/migrations/meta/0001_snapshot.json` via DrizzleKit.
- [x] 1.4 Create `app/api/queries/solicitud-closure-security.ts` with PIN validation, throttle bookkeeping, and audit-write helpers.

## Phase 2: Core API

- [x] 2.1 Update `app/api/queries/create-solicitud.ts` to generate both `pinGestion` and `pinCierre` and return `{ id, pinGestion, pinCierre }`.
- [x] 2.2 Sanitize `solicitudes.getById` in `app/api/solicitudes-router.ts` to omit `pinGestion` and `pinCierre`.
- [x] 2.3 Extend `solicitudes.updateStatus` in `app/api/solicitudes-router.ts` to require `pinCierre` for `recibido`, allow `pinGestion` for non-terminal transitions, and persist optional `notasCierre`.
- [x] 2.4 Add `solicitudes.adminClose` mutation in `app/api/solicitudes-router.ts` using `adminQuery`, requiring reason and writing to `solicitudClosureAudit`.
- [x] 2.5 Wire throttle checks into the terminal-close path using helpers from `app/api/queries/solicitud-closure-security.ts`.

## Phase 3: UI

- [x] 3.1 Update `app/src/pages/NuevaSolicitud.tsx` success screen to show both PINs with distinct labels.
- [x] 3.2 Remove `pinCierre`/`pinGestion` exposure from `app/src/pages/DetalleSolicitud.tsx`; add optional admin override panel for authenticated admins.
- [x] 3.3 Update `app/src/pages/Gestion.tsx` to use `pinGestion` for lookup, require `pinCierre` for close, collect optional `notasCierre`, and render throttle errors.

## Phase 4: Testing

- [x] 4.1 Extend `app/api/queries/create-solicitud.test.ts` to assert both PINs are returned and unique.
- [x] 4.2 Extend `app/api/solicitudes-router.test.ts` with split-PIN transitions, admin-close reason validation, sanitized `getById`, and throttling.
- [x] 4.3 Add focused tests for `app/api/queries/solicitud-closure-security.ts` helpers (PIN validation, throttle window math, audit writes).
- [x] 4.4 Fix `app/api/integration/parallel-creates.integration.test.ts` type assertion for new `CreateSolicitudResult`.

### 4.4 React UI tests — manual QA required

The project does NOT have a React test infrastructure in place:
- No `@testing-library/react` / `@testing-library/jest-dom` dependency in `package.json`.
- No `jsdom` / `happy-dom` adapter wired into `vitest.config.ts` (it sets `environment: "node"` and the `include` glob covers only `api/**` and `scripts/**`).
- No `*.test.*` / `*.spec.*` files under `app/src/`.

Per the design's testing strategy ("Add focused React tests only for changed page behaviors if project already supports them"), adding the React test infrastructure (jsdom adapter + @testing-library + per-page tests for `NuevaSolicitud`, `DetalleSolicitud`, and `Gestion`) is out of scope for this work unit. Manual QA against the changed pages is required before merge.

Pages that need manual UI verification:
- `app/src/pages/NuevaSolicitud.tsx` — success screen renders BOTH `pinGestion` and `pinCierre` with distinct labels.
- `app/src/pages/DetalleSolicitud.tsx` — public detail does NOT expose `pinCierre`; admin override panel renders for authenticated admins.
- `app/src/pages/Gestion.tsx` — uses `pinGestion` for lookup, requires `pinCierre` for close, captures optional `notasCierre`, renders throttle errors.
