# Proposal: Restricted Solicitud Closure

## Intent
Prevent public viewers from closing solicitudes by separating management from terminal closure. The change introduces a private closure credential, optional closure notes, and an auditable admin recovery path.

## Scope
### In Scope
- Add `pinCierre` to every solicitud and require it for any transition to `recibido`.
- Keep `pinGestion` for non-terminal lifecycle updates and stop showing closure credentials on the public detail page.
- Capture optional `notasCierre`, migrate existing rows with generated closure PINs, and log admin overrides with actor + reason.

### Out of Scope
- Replacing PIN flows with user accounts or ownership-based auth.
- Reworking unrelated solicitud creation, search, or moderation behavior.

## Capabilities
### New Capabilities
- `solicitud-lifecycle-management`: Defines split authorization between intermediate status updates and terminal closure.
- `solicitud-admin-recovery-audit`: Defines admin override and audit requirements for lost closure credentials.

### Modified Capabilities
- None.

## Approach
Extend the solicitud model with `pinCierre` and `notasCierre`. Server rules allow `pinGestion` for non-terminal transitions only; any move to `recibido` requires `pinCierre` or an admin override that records who acted and why. Public `/solicitud/:id` stops exposing management secrets; creator-facing flows remain the only place where credentials are shown.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `app/db/schema.ts` | Modified | Add closure PIN, closure notes, override audit fields/tables as needed. |
| `app/api/solicitudes-router.ts` | Modified | Enforce split transition rules and admin override logging. |
| `app/api/queries/create-solicitud.ts` | Modified | Generate `pinCierre` for new and migrated solicitudes. |
| `app/src/pages/DetalleSolicitud.tsx` | Modified | Remove public credential exposure. |
| `app/src/pages/Gestion.tsx` | Modified | Collect `pinCierre` and optional `notasCierre` for closure. |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Users lose `pinCierre` | Med | Provide audited admin recovery/closure path. |
| Two PINs confuse users | Med | Use distinct labels and closure-only guidance on creator flows. |
| Weak PIN guessing | Med | Rate-limit attempts and consider longer `pinCierre` if needed. |

## Rollback Plan
Re-enable single-PIN closure rules in the API, restore prior UI visibility only if strictly necessary, and keep migrated `pinCierre` data dormant until a corrected rollout is ready. If audit storage is added, preserve records during rollback.

## Dependencies
- Database migration for existing solicitudes.
- Existing admin identity path for authenticated override actions.

## Success Criteria
- [ ] Public `/solicitud/:id` no longer reveals any credential that can close a solicitud.
- [ ] `pinGestion` can advance non-terminal states but cannot close to `recibido`.
- [ ] `pinCierre` closes solicitudes with optional `notasCierre` for both new and migrated rows.
- [ ] Admin override actions are restricted and persist actor + reason.
