# Design: Public Medication Submission Hardening

## Technical Approach

Keep `solicitudes.create` public and immediate, but move contact hardening to a shared validation contract used by both the form and the router. The change adds one pure phone-normalization module, applies it at UI submit and API input boundaries, updates WhatsApp links to use normalized digits instead of a hardcoded `58`, and narrows admin-context handling so verified local admins can satisfy moderator-only guards without changing public permissions.

## Architecture Decisions

### Decision: Shared phone contract
| Option | Tradeoff | Decision |
|---|---|---|
| Frontend-only regex | Easy to bypass | Reject |
| Duplicate FE/BE validators | Drift risk | Reject |
| Pure shared helper in `app/contracts/phone.ts` | Small new shared surface | Choose |

Rationale: `NuevaSolicitud`, `solicitudesRouter.create`, and `WhatsAppButton` need the same parsing rules. A pure helper keeps validation deterministic across browser and server.

### Decision: Normalize to a canonical stored phone
| Option | Tradeoff | Decision |
|---|---|---|
| Store raw input, normalize only for WhatsApp | Public display stays inconsistent | Reject |
| Store canonical `+{country}{number}` string | Existing UI shows normalized values | Choose |

Rationale: the specs allow normalization, no schema change is required, and canonical storage makes public display, sharing, and WhatsApp linking agree.

### Decision: Separate moderator actor from OAuth user context
| Option | Tradeoff | Decision |
|---|---|---|
| Put local admin into `ctx.user` | Breaks `auth.me` OAuth assumptions and `User` typing | Reject |
| Add dedicated moderator/admin actor in context and let `adminQuery` read it | Small middleware refactor | Choose |

Rationale: `ctx.user` is currently typed as OAuth `User`, while local auth returns `localUsers`. Keeping them separate preserves `auth.me` / `useAuth()` behavior and limits the auth-surface change to restricted actions.

## Data Flow

```text
Visitor -> NuevaSolicitud.validate()
        -> normalizePhone(input.telefono)
        -> success? submit normalized telefono : block with field error

NuevaSolicitud -> solicitudes.create
               -> zod required-field checks
               -> normalizePhone(input.telefono)
               -> createSolicitud(normalized input)
               -> DB row saved with canonical telefono

SolicitudCard/DetalleSolicitud -> WhatsAppButton
                               -> normalizePhone(stored telefono)
                               -> https://wa.me/{whatsappDigits}

Request -> createContext
        -> OAuth session? ctx.user + ctx.moderatorActor
        -> else local JWT? ctx.moderatorActor only
        -> adminQuery authorizes moderator-only actions from either source
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/contracts/phone.ts` | Create | Shared `normalizePhone` / `validatePhone` helper returning canonical display and WhatsApp digits. |
| `app/api/context.ts` | Modify | Resolve `moderatorActor` from OAuth session first, then verified local JWT header. |
| `app/api/middleware.ts` | Modify | Keep `authedQuery` OAuth-based; make `adminQuery` authorize against the shared moderator actor. |
| `app/api/local-auth-token.ts` | Create | Extract local JWT verify helper so context and router share it without importing the router. |
| `app/api/local-auth-router.ts` | Modify | Reuse the extracted token helper. |
| `app/api/solicitudes-router.ts` | Modify | Enforce required contributor fields, normalize phone server-side, and return clear `BAD_REQUEST` feedback on malformed phones. |
| `app/src/pages/NuevaSolicitud.tsx` | Modify | Replace digit-count validation with shared phone validation, submit normalized phone, and map API field errors back to the form. |
| `app/src/components/WhatsAppButton.tsx` | Modify | Build `wa.me` links from normalized digits instead of prepending `58`. |
| `app/api/solicitudes-router.test.ts` / `app/api/local-auth-router.test.ts` | Modify | Cover malformed phones, canonical normalization, and local-admin moderator authorization. |

## Interfaces / Contracts

```ts
export type NormalizedPhone = {
  canonical: string; // e.g. +584141234567
  whatsappDigits: string; // e.g. 584141234567
};

export function normalizePhone(input: string): NormalizedPhone;
```

Accepted input: separators/spaces/parentheses are ignored; a leading `+` is preserved for international parsing; Venezuelan local forms such as `0414...` are converted to `+58...`; malformed values throw a domain error with a user-safe message.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | VE and international acceptance, malformed rejection, WhatsApp digit derivation | Add Vitest coverage for the shared phone helper. |
| Router | `solicitudes.create` rejects missing/invalid contact, stores canonical phone, preserves immediate publication | Extend `app/api/solicitudes-router.test.ts` with create-caller assertions. |
| Auth | Valid local admin token satisfies `adminQuery`; invalid/absent token stays denied; `auth.me` remains OAuth-only | Add middleware/context-focused tests beside local auth tests. |
| Integration | Release contract still passes type/build/test entrypoints | Run existing `npm test`, `npm run test:integration`, and `npm run check`. |

## Migration / Rollout

No migration required. Existing rows stay readable because `WhatsAppButton` normalizes on read. Roll out API and UI together so new field-error handling matches backend messages. Rollback is a code revert of the shared phone helper, router/form call sites, WhatsApp URL builder, and moderator-actor context path.

## Open Questions

- [ ] None.
