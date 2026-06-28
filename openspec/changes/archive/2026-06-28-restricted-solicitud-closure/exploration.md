# Exploration: Restricted Solicitud Closure

## Current State

MedVene models medication requests as `solicitudes` in `app/db/schema.ts`. Each solicitud has a public lifecycle status (`estatus`: `activo` → `en_proceso` → `recibido`) and a single 6-digit management PIN (`pinGestion`) stored as a unique `varchar(8)`.

The closure flow today is:

1. Anyone can view any solicitud at `/solicitud/:id` (`solicitudes.getById` is fully public).
2. The detail page renders the management PIN in plain text and links to `/gestion/:pin` (`DetalleSolicitud.tsx`, lines 354-366).
3. `/gestion/:pin` (`Gestion.tsx`) lets anyone with the PIN advance the status, including jumping directly from `activo` to `recibido` (the "Marcar directamente como RECIBIDO" button).
4. `solicitudes.updateStatus` validates `id + pin` server-side, but because the PIN is displayed on the public page, the effective authorization is "anyone who opens the link."

A `notas` text field already exists on `solicitudes`, but it is captured at creation time and shown publicly on the detail page; it is not tied to closure.

The app ships with both OAuth (Kimi) and local JWT auth (`useAuth`, `localAuthRouter`, `authRouter`), but the product direction is to keep creation public and avoid login friction for daily use. That makes per-user ownership unsuitable as the primary gate for the close action.

## Affected Areas

- `app/db/schema.ts` — `solicitudes` table; may need a closure-specific secret/token or closure-notes column.
- `app/api/solicitudes-router.ts` — `updateStatus`, `getById`, `getByPin`, and any new closure mutation.
- `app/api/queries/create-solicitud.ts` — PIN generation logic; new secrets/tokens would be generated here.
- `app/src/pages/DetalleSolicitud.tsx` — currently exposes `pinGestion`; needs to stop leaking the closure credential.
- `app/src/pages/Gestion.tsx` — closure UI; needs to collect closure notes if that requirement is adopted.
- `app/src/pages/NuevaSolicitud.tsx` — success screen already shows the PIN; may need to show a separate closure code or stress not sharing it.
- `app/src/App.tsx` — no route changes required unless a dedicated closure page is added.

## Approaches

### 1. Hide the existing PIN and treat it as the closure secret

Stop rendering `pinGestion` on `/solicitud/:id`. Keep showing it only on the creation success screen and in the WhatsApp-style share the creator sends privately. The server-side `updateStatus` check already requires the PIN, so removing the public leak restores its value as a "something you have" credential.

- **Pros**
  - Minimal schema change (none).
  - Reuses the existing 6-digit PIN and `/gestion/:pin` flow.
  - No new auth concepts for users to learn.
- **Cons**
  - The same PIN is still used for *all* status transitions (`activo` → `en_proceso` → `recibido`). If an intermediary (e.g., a donor helping the requester) is trusted to mark "en_proceso," they can also close the request.
  - No per-closure audit trail or notes field.
- **Effort**: Low

### 2. Separate closure token / closure password

Add a second secret column, e.g., `pinCierre` (or `closureToken`), generated alongside `pinGestion`. The management PIN continues to handle status transitions, but only the closure token can move `en_proceso`/`activo` → `recibido`. Optionally allow the creator to set a custom closure phrase. The public detail page never displays this token.

- **Pros**
  - Fine-grained authorization: helpers can update intermediate status, but only someone with the closure token can finish the order.
  - Matches the user's concern that "completing" is different from "managing."
  - Easy to communicate (another 6-8 digit code, or a short phrase).
- **Cons**
  - Adds a new credential for users to save/share.
  - Requires schema migration and updates to `updateStatus` validation.
- **Effort**: Medium

### 3. Closure notes + secret-phrase gate

Keep a single PIN but require the user to enter an optional "closure phrase" (set at creation or first management visit) before the final `recibido` transition. Store closure notes separately (e.g., new `notasCierre` column). The phrase is never shown on the public page.

- **Pros**
  - Satisfies the "leave notes" requirement explicitly.
  - The phrase acts as a lightweight second factor only for the destructive/terminal action.
- **Cons**
  - More UI flow: set phrase, confirm phrase, enter notes, then close.
  - If the phrase is forgotten, recovery is hard without login/identity.
- **Effort**: Medium

### 4. Time-limited / one-time completion links

Generate a signed or hashed one-time URL (e.g., `/cerrar/:token`) when the solicitud is created or when the manager requests it. Opening the link and confirming closes the order. The token is single-use or expires after N hours.

- **Pros**
  - No digits to remember; works well on mobile WhatsApp shares.
  - Strongest guarantee that "just anyone" cannot close the order.
- **Cons**
  - Highest implementation complexity (token storage, expiration, revocation).
  - Losing the link before use blocks legitimate closure.
- **Effort**: High

## Recommendation

Start with **Approach 2 (separate closure token)** combined with a small piece of Approach 3 (closure notes). Specifically:

- Add `pinCierre` to `solicitudes`, generated at creation alongside `pinGestion`.
- Keep `pinGestion` for intermediate status changes but require `pinCierre` for any transition to `recibido`.
- Remove `pinGestion` from the public detail page; show both codes only on the creation success screen.
- Add an optional `notasCierre` field captured when the final close action is performed.

This gives the user the "code that is not visible to everyone" they asked for, avoids login friction, and adds the closure notes they mentioned, while reusing the existing mobile-first PIN paradigm.

## Risks

- **Credential loss**: Without login, a lost closure PIN means the order cannot be closed by the requester. Mitigation: keep `pinGestion` visible to support staff / admins, or provide an admin override.
- **PIN brute force**: 6-digit codes are guessable. Mitigation: rate-limit `updateStatus`/`close` attempts per solicitud, consider 8 digits for `pinCierre`, and monitor for abuse.
- **UI confusion**: Two PINs are harder to explain than one. Mitigation: clear labels ("PIN de gestión" vs. "PIN de cierre") and a single guided closure flow.
- **Data migration**: Existing solicitudes have no `pinCierre`; a default value or admin-only closure is needed for them.

## Ready for Proposal

**Yes.** The next step is `sdd-propose`. The orchestrator should ask the user to confirm:

1. Whether they want one PIN or two separate PINs.
2. Whether closure notes are required or optional.
3. How to handle existing solicitudes that lack a closure PIN.
4. Whether an admin override is acceptable for lost credentials.
