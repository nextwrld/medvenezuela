# Tasks: Public Medication Submission Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500–650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: phone contract + unit tests; PR 2: router/context/middleware + tests; PR 3: frontend form + WhatsAppButton |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> Canonical phone normalization (`+{country}{number}`) is an implementation choice. Tests MUST assert canonical stored values and WhatsApp links, and the UI MUST display the stored canonical phone.

## Phase 1: Shared Phone Contract

- [ ] 1.1 RED: Add failing Vitest cases in `app/contracts/phone.test.ts` for valid VE, valid international, malformed, and edge separator inputs.
- [ ] 1.2 GREEN: Create `app/contracts/phone.ts` with `normalizePhone` returning `{ canonical, whatsappDigits }` and a user-safe domain error for malformed values.
- [ ] 1.3 REFACTOR: Extract separator stripping, VE-local prefix handling, and document accepted formats in the module header.

## Phase 2: Backend Validation & Moderator Context

- [ ] 2.1 RED: Extend `app/api/solicitudes-router.test.ts` with cases for missing `nombreSolicitante`, missing `telefono`, and malformed `telefono` expecting `BAD_REQUEST` and explicit field identification.
- [ ] 2.2 GREEN: Update `app/api/solicitudes-router.ts` `create` to enforce required contributor fields, normalize `telefono`, and throw field-identifying `BAD_REQUEST` errors.
- [ ] 2.3 RED: Add middleware/context tests verifying valid local admin token satisfies `adminQuery`, invalid/absent tokens are denied, and `auth.me` stays OAuth-only.
- [ ] 2.4 GREEN: Create `app/api/local-auth-token.ts` with shared `verifyLocalToken`; update `app/api/context.ts` to resolve `moderatorActor`; update `app/api/middleware.ts` `adminQuery` to authorize from `moderatorActor`; reuse the helper in `app/api/local-auth-router.ts`.
- [ ] 2.5 REFACTOR: Align contributor field error messages between router and contract so clients can map them by field.

## Phase 3: Frontend Hardening

- [ ] 3.1 RED: Add/update page/component tests for `NuevaSolicitud` and `WhatsAppButton` asserting shared phone validation blocks submission and normalized links are produced.
- [ ] 3.2 GREEN: Update `app/src/pages/NuevaSolicitud.tsx` to validate via `normalizePhone`, block submission with field errors, submit canonical `telefono`, and map backend field errors to form fields.
- [ ] 3.3 GREEN: Update `app/src/components/WhatsAppButton.tsx` to derive `wa.me` links from normalized digits instead of prepending `58`.
- [ ] 3.4 REFACTOR: Remove old digit-count validation and any hardcoded country prefix from the form and button.

## Phase 4: Verification

- [ ] 4.1 Run `npm test` and `npm run test:integration`; fix regressions in router, auth, and contract suites.
- [ ] 4.2 Run `npm run check` and `npm run lint`; resolve type or lint errors introduced by the new shared contract and context changes.
