# Proposal: Harden MVP Deployment

## Intent

Make the MVP safely deployable on its current MySQL/Drizzle architecture. It has a production boot path and database-backed features, but lacks migrations, concurrency-safe PIN allocation, and meaningful automated confidence.

## Scope

### In Scope
- Establish a managed MySQL provisioning and checked-in migration workflow.
- Validate runtime configuration and production build/start behavior.
- Make solicitud creation and PIN allocation safe under concurrent requests.
- Add minimum automated tests and deploy verification for database, auth, and solicitud paths.

### Out of Scope
- Replacing MySQL, Drizzle, tRPC, or the current application architecture.
- Multi-region deployment, exhaustive tuning, or full observability.
- Product feature expansion unrelated to deployment readiness.

## Capabilities

No existing capabilities were found under `openspec/specs/`.

### New Capabilities
- `database-lifecycle`: Managed MySQL, versioned migrations, and repeatable schema deployment.
- `production-runtime`: Validated environment contract, production boot, health behavior, and graceful failure expectations.
- `concurrent-solicitud-creation`: Atomic, collision-safe solicitud creation and PIN management under concurrency.
- `mvp-deploy-verification`: Tests and release checks for critical database, auth, and solicitud flows.

### Modified Capabilities
- None.

## Approach

Keep MySQL/Drizzle, commit baseline migrations, and run them before rollout. Enforce PIN uniqueness in the database with bounded retry or equivalent atomic handling. Add readiness checks and focused Vitest coverage. Document database prerequisites without coupling the app to one provider.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/db/` | Modified | Migrations, constraints, and lifecycle workflow |
| `app/api/queries/connection.ts` | Modified | Production-safe database connectivity |
| `app/api/solicitudes-router.ts` | Modified | Concurrent creation and PIN handling |
| `app/api/local-auth-router.ts` | Modified | Critical-path verification |
| `app/api/boot.ts`, `app/api/lib/env.ts` | Modified | Runtime readiness and failure behavior |
| `app/` tests/config/docs | New/Modified | Tests and deployment procedure |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migration damages existing data | Med | Review SQL, backup first, and test rollback/restore |
| PIN space contention causes failures | Med | Unique constraint, bounded retry, collision tests |
| Connection exhaustion under load | Med | Explicit pool limits and concurrency verification |

## Rollback Plan

Deploy application and schema changes separately. Retain the previous artifact, prefer backward-compatible migrations, and restore a database backup when rollback is unsafe.

## Dependencies

- Managed MySQL with backups, failover, TLS, and migration access.
- Production secrets and external auth configuration defined by `.env.example`.

## Success Criteria

- [ ] A clean database reaches the expected schema through committed migrations.
- [ ] Production build and boot pass with validated runtime configuration.
- [ ] Concurrent solicitud creation cannot persist duplicate PINs.
- [ ] Critical database, auth, and solicitud tests pass in CI/release verification.
