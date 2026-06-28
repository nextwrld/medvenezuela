# Proposal: Public Medication Submission Hardening

## Intent
Keep public medication submission immediate, but stop bad contact data from reaching the public feed. Today the form only checks digit count, the API accepts any non-empty string, and `WhatsAppButton` hardcodes `+58`.

## Scope
### In Scope
- Require contributor name and phone for public `solicitudes.create`, blocking invalid phones with clear errors.
- Add shared phone validation that supports Venezuelan and international numbers in frontend and backend.
- Update WhatsApp contact behavior to stop assuming `+58` while preserving public contact visibility and moderator-only edit/delete.

### Out of Scope
- Adding moderation queues, login requirements, or hiding contact.
- Reworking unrelated local auth flows beyond the shared auth-context gap.

## Capabilities
### New Capabilities
- `public-medication-submission`: Public creation, required contributor identity, immediate publication, and phone validation.
- `moderator-solicitud-actions`: Moderator-only edit/delete authorization for shared auth context.

### Modified Capabilities
- None.

## Approach
Use one phone policy in `NuevaSolicitud` and `solicitudesRouter.create`: accept valid Venezuelan plus international numbers and reject malformed values. `WhatsAppButton` should build links from normalized numbers instead of prepending `58`. Auth context should also recognize local admin JWTs so shared moderator guards remain enforceable.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `app/src/pages/NuevaSolicitud.tsx` | Modified | Replace weak client validation with blocking errors. |
| `app/api/solicitudes-router.ts` | Modified | Enforce backend phone validation on public create. |
| `app/src/components/WhatsAppButton.tsx` | Modified | Remove Venezuela-only WhatsApp URL construction. |
| `app/api/context.ts` | Modified | Inject local admin auth into shared tRPC context. |
| `app/src/providers/trpc.tsx` | Modified | Preserve the frontend local admin JWT header path. |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Validation rejects real numbers | Med | Define explicit accepted formats and cover VE + intl examples in tests. |
| Auth-context fix broadens admin access incorrectly | Low | Limit context injection to verified local admin tokens and reuse existing role checks. |

## Rollback Plan
Revert the shared phone validator, restore prior WhatsApp link behavior, and disable local-admin context injection. No production data migration is required; the auth surface change is limited to request-context resolution.

## Dependencies
- Existing `solicitudes` public creation flow and local admin JWT issuance path.

## Success Criteria
- [ ] Public submissions still publish immediately without login.
- [ ] Missing or invalid contributor phone blocks submission in UI and API with clear feedback.
- [ ] Venezuelan and international valid numbers pass and produce usable WhatsApp links.
- [ ] Contributor name/phone remain public, while moderator edit/delete stays restricted.

## Proposal Question Round
- Confirm that valid non-WhatsApp numbers may still publish.
- Confirm that normalization is acceptable for validation/linking.
