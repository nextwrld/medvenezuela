import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

// `solicitud-closure-security` isolates the PIN-validation, throttle
// bookkeeping, and audit-write helpers that the restricted-closure
// flow needs. Keeping these in their own module means the router can
// stay focused on the tRPC contract and the existing auth/role gating,
// while the security-sensitive primitives remain easy to unit-test
// in Work Unit 4 without spinning up a real router.

// `THROTTLE_WINDOW_MS` defines the rolling time window over which
// `THROTTLE_MAX_ATTEMPTS` failed closure attempts are counted. The
// constants are exported so the tests can assert on the exact budget
// and so future operational tuning happens in one place.
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const THROTTLE_MAX_ATTEMPTS = 5;

// Domain-separated identifier hash so the throttle table never stores
// raw client identifiers (IP addresses, user IDs, etc.). The prefix
// is intentionally a constant so a future table that hashes the same
// value cannot accidentally produce the same digest.
const IDENTIFIER_HASH_PREFIX = "solicitud-closure";

export function hashIdentifier(identifier: string): string {
  return createHash("sha256")
    .update(`${IDENTIFIER_HASH_PREFIX}:${identifier}`)
    .digest("hex");
}

// `validateClosurePin` compares a caller-supplied closure PIN against
// the stored value in constant time. Returning `false` for the
// null/empty cases keeps the caller from having to null-check before
// invoking the helper and avoids leaking which side of the comparison
// was malformed through error messages.
export function validateClosurePin(
  supplied: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (!supplied || !stored) return false;
  if (supplied.length !== stored.length) return false;
  // `timingSafeEqual` requires equal-length Buffers; the length guard
  // above guarantees that. Re-encoding as Buffers keeps the comparison
  // constant-time even though `supplied` and `stored` are ASCII-only
  // digits in practice.
  const a = Buffer.from(supplied);
  const b = Buffer.from(stored);
  return timingSafeEqual(a, b);
}

export type ThrottleDecision = {
  allowed: boolean;
  remaining: number;
  resetsAt: Date;
};

// `checkThrottle` reads the (solicitudId, identifierHash) bookkeeping
// row and returns a snapshot of the throttle state. The optional `now`
// argument exists purely to make window math deterministic in tests;
// production callers omit it and rely on `new Date()`.
export async function checkThrottle(
  solicitudId: number,
  identifierHash: string,
  now: Date = new Date(),
): Promise<ThrottleDecision> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.solicitudClosureAttempts)
    .where(
      and(
        eq(schema.solicitudClosureAttempts.solicitudId, solicitudId),
        eq(schema.solicitudClosureAttempts.identifierHash, identifierHash),
      ),
    )
    .limit(1);

  const record = rows.at(0);
  const windowStart = new Date(now.getTime() - THROTTLE_WINDOW_MS);

  // No record, or the recorded window has already expired — treat as
  // a fresh window with the full attempt budget available.
  if (!record || record.windowStartsAt < windowStart) {
    return {
      allowed: true,
      remaining: THROTTLE_MAX_ATTEMPTS,
      resetsAt: new Date(now.getTime() + THROTTLE_WINDOW_MS),
    };
  }

  const remaining = Math.max(0, THROTTLE_MAX_ATTEMPTS - record.attemptCount);
  return {
    allowed: remaining > 0,
    remaining,
    resetsAt: new Date(record.windowStartsAt.getTime() + THROTTLE_WINDOW_MS),
  };
}

// `recordAttempt` increments the failure counter for a (solicitudId,
// identifierHash) pair, opening a fresh window if the previous one has
// already expired. The read-then-write pattern has a small race that
// can let one extra attempt slip through the throttle under heavy
// concurrency, which is acceptable for a PIN-guessing defense — a
// few extra attempts cannot meaningfully shorten the search space.
export async function recordAttempt(
  solicitudId: number,
  identifierHash: string,
  now: Date = new Date(),
): Promise<void> {
  const db = getDb();
  const windowStart = new Date(now.getTime() - THROTTLE_WINDOW_MS);

  const rows = await db
    .select()
    .from(schema.solicitudClosureAttempts)
    .where(
      and(
        eq(schema.solicitudClosureAttempts.solicitudId, solicitudId),
        eq(schema.solicitudClosureAttempts.identifierHash, identifierHash),
      ),
    )
    .limit(1);

  const existing = rows.at(0);

  if (!existing || existing.windowStartsAt < windowStart) {
    // Open a fresh window. The composite unique index on
    // (solicitudId, identifierHash) means a concurrent caller racing
    // to the same fresh-window insert will fail with ER_DUP_ENTRY;
    // we collapse that into the same row by upserting.
    await db
      .insert(schema.solicitudClosureAttempts)
      .values({
        solicitudId,
        identifierHash,
        windowStartsAt: now,
        attemptCount: 1,
      })
      .onDuplicateKeyUpdate({
        set: {
          windowStartsAt: now,
          attemptCount: 1,
        },
      });
    return;
  }

  // Active window — increment without sliding the window forward.
  await db
    .update(schema.solicitudClosureAttempts)
    .set({
      attemptCount: sql`${schema.solicitudClosureAttempts.attemptCount} + 1`,
    })
    .where(eq(schema.solicitudClosureAttempts.id, existing.id));
}

export type ClosureAction = "admin_close";

export interface WriteAuditInput {
  solicitudId: number;
  actorUserId: number;
  actorName?: string | null;
  reason: string;
  action: ClosureAction;
}

// `writeAudit` inserts a single row into the closure-audit table.
// Callers MUST only invoke this AFTER the override has been validated
// and applied — failed validations (missing reason, insufficient role,
// etc.) are not part of the audit trail so the history only records
// actions that actually changed solicitud state.
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const db = getDb();
  await db.insert(schema.solicitudClosureAudit).values({
    solicitudId: input.solicitudId,
    actorUserId: input.actorUserId,
    actorName: input.actorName ?? null,
    action: input.action,
    reason: input.reason,
  });
}
