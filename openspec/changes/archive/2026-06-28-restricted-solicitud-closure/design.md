# Design: Restricted Solicitud Closure

## Technical Approach

Keep the current public + tRPC architecture, but split lifecycle authorization at the API boundary. New solicitudes receive both `pinGestion` and `pinCierre`; only `pinCierre` may transition `estatus` to `recibido`. Public detail data is sanitized so closure credentials never leave creator/admin-only flows. Admin override uses the existing authenticated role model and writes durable audit records.

## Architecture Decisions

### Decision: Separate close authorization from general management
**Choice**: Add `pinCierre`, `notasCierre`, and closure metadata to `solicitudes`; keep `pinGestion` for non-terminal transitions.
**Alternatives considered**: Reuse one PIN with stricter UI; replace PINs with accounts.
**Rationale**: Server-side separation removes the current closure leak without changing the product model to full accounts.

### Decision: Use dedicated admin mutation + audit table
**Choice**: Add `adminClose` under `solicitudesRouter` using `adminQuery`, plus `solicitudClosureAudit` table (`solicitudId`, `actorUserId`, `reason`, `action`, `createdAt`).
**Alternatives considered**: Reuse public mutation with optional admin flag; store override reason directly on `solicitudes`.
**Rationale**: `adminQuery` matches existing auth middleware, and a separate table preserves many-to-one history for rollback and investigations.

### Decision: Persist rate-limit state in MySQL
**Choice**: Add `solicitudClosureAttempts` keyed by `solicitudId + identifierHash` with window timestamps/counts; derive identifier from forwarded IP headers.
**Alternatives considered**: In-memory throttling; frontend-only lockout.
**Rationale**: In-memory breaks across instances/restarts, and frontend throttling has no security value.

## Data Flow

```text
NuevaSolicitud -> solicitudes.create -> create-solicitud.ts
               -> DB(solicitudes: pinGestion + pinCierre)
               -> success screen shows both PINs once

DetalleSolicitud -> solicitudes.getById(public projection)
                 -> no pinCierre, no visible secret

Gestion -> solicitudes.getByPin(pinGestion)
        -> non-terminal update: validate pinGestion -> update estatus
        -> terminal close: check throttle -> validate pinCierre -> save notasCierre -> set estatus=recibido

Admin user -> solicitudes.adminClose(adminQuery)
           -> validate reason -> update solicitud
           -> insert solicitudClosureAudit
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/db/schema.ts` | Modify | Add `pinCierre`, `notasCierre`, `closedAt`; add audit + attempt tables. |
| `app/db/migrations/0001_restricted_solicitud_closure.sql` | Create | Schema migration for new columns/tables/indexes. |
| `app/db/migrations/meta/0001_snapshot.json` | Create | Drizzle snapshot update. |
| `app/api/queries/create-solicitud.ts` | Modify | Generate and return both PINs for creator-only flow. |
| `app/api/queries/solicitud-closure-security.ts` | Create | Shared helpers for PIN validation, throttle bookkeeping, and audit writes. |
| `app/api/solicitudes-router.ts` | Modify | Sanitize `getById`, extend `updateStatus`, add `adminClose`. |
| `app/src/pages/NuevaSolicitud.tsx` | Modify | Success screen shows `pinGestion` + `pinCierre` with clear labels. |
| `app/src/pages/DetalleSolicitud.tsx` | Modify | Remove visible PIN leak; optional admin override panel for authenticated admins. |
| `app/src/pages/Gestion.tsx` | Modify | Use `pinGestion` lookup, require `pinCierre` only for close, collect optional `notasCierre`, surface throttle errors. |
| `app/api/solicitudes-router.test.ts` / `app/api/queries/create-solicitud.test.ts` | Modify | Cover split PIN, admin override, and throttle contracts. |

## Interfaces / Contracts

```ts
type UpdateStatusInput = {
  id: number;
  pinGestion: string;
  estatus: "activo" | "en_proceso" | "recibido";
  pinCierre?: string;
  notasCierre?: string;
};

type AdminCloseInput = {
  id: number;
  reason: string;
  notasCierre?: string;
};
```

`getById` should return a public DTO without `pinGestion`/`pinCierre`. `create` should return `{ id, pinGestion, pinCierre }`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | PIN generation, throttle window math, audit helper behavior | Extend Vitest query/helper tests with mocked DB/time. |
| Router | `pinGestion` cannot close, `pinCierre` can, admin reason required, public DTO sanitized | Extend `app/api/solicitudes-router.test.ts`. |
| Integration | Migration files + schema contract + create contract shape | Add structural integration coverage beside existing migration tests. |
| UI | Success screen labels, gestion close form, no public PIN leak | Add focused React tests only for changed page behaviors if project already supports them. |

## Migration / Rollout

1. Add nullable `pinCierre`, `notasCierre`, `closedAt`, plus audit/attempt tables.
2. Run a backfill script in the release step to generate unique `pinCierre` values using the same retry logic as creation; this avoids unsafe SQL random collisions.
3. Add unique index + `NOT NULL` to `pinCierre` after backfill succeeds.
4. Deploy API/UI together so old clients cannot attempt single-PIN closure.
5. Monitor audit inserts and throttle responses; rollback may restore old mutation rules, but audit data remains intact.

## Open Questions

- [ ] None.
