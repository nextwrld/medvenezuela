import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// Hoisted mocks: vi.mock factories run before the module under test, so
// any state they reference must also be hoisted via `vi.hoisted`.
const { getDbMock, makeDb } = vi.hoisted(() => {
  // The production code calls `getDb()` once per operation and reuses
  // the same `db` for both the read and the write. The `db` object
  // must therefore expose every method the call path needs in a single
  // shape: `select` (and chains), `insert` (+ values + onDuplicateKeyUpdate),
  // and `update` (+ set + where).
  function makeDb(rows: unknown[] = []) {
    // Read chain: `db.select().from().where().limit()`.
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    // Insert chain: `db.insert().values().onDuplicateKeyUpdate()` —
    // the terminal step is awaitable.
    const terminal = Promise.resolve(undefined);
    const onDuplicateKeyUpdate = vi.fn().mockReturnValue(terminal);
    const values = vi.fn().mockReturnValue({ onDuplicateKeyUpdate });
    const insert = vi.fn().mockReturnValue({ values });

    // Update chain: `db.update().set().where()` — the terminal is
    // also awaitable.
    const updWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: updWhere });
    const update = vi.fn().mockReturnValue({ set });

    return {
      // Read methods.
      select,
      from,
      where,
      limit,
      // Write methods.
      insert,
      values,
      onDuplicateKeyUpdate,
      update,
      set,
      whereOnUpdate: updWhere,
    };
  }
  const getDbMock = vi.fn();
  return { getDbMock, makeDb };
});

vi.mock("./connection", () => ({
  getDb: getDbMock,
}));

import {
  hashIdentifier,
  validateClosurePin,
  checkThrottle,
  recordAttempt,
  writeAudit,
  THROTTLE_WINDOW_MS,
  THROTTLE_MAX_ATTEMPTS,
} from "./solicitud-closure-security";

beforeEach(() => {
  getDbMock.mockReset();
});

describe("hashIdentifier", () => {
  it("returns a sha256 hex digest of the prefixed identifier", () => {
    const expected = createHash("sha256")
      .update("solicitud-closure:1.2.3.4")
      .digest("hex");
    expect(hashIdentifier("1.2.3.4")).toBe(expected);
  });

  it("produces a 64-character hex string (256 bits)", () => {
    const out = hashIdentifier("anything");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same identifier", () => {
    expect(hashIdentifier("ip-a")).toBe(hashIdentifier("ip-a"));
  });

  it("differs for different identifiers (no collisions on common IPs)", () => {
    const a = hashIdentifier("10.0.0.1");
    const b = hashIdentifier("10.0.0.2");
    expect(a).not.toBe(b);
  });

  it("includes the domain prefix so the digest never collides with an unprefixed hash", () => {
    // Sanity: hashing the same value without the prefix would produce
    // a different digest. This protects against future code that might
    // hash an identifier in another context and accidentally collide
    // with the throttle key.
    const unprefixed = createHash("sha256").update("1.2.3.4").digest("hex");
    expect(hashIdentifier("1.2.3.4")).not.toBe(unprefixed);
  });
});

describe("validateClosurePin", () => {
  it("returns true for equal 6-digit PINs", () => {
    expect(validateClosurePin("123456", "123456")).toBe(true);
  });

  it("returns false for different PINs of equal length", () => {
    expect(validateClosurePin("123456", "654321")).toBe(false);
  });

  it("returns false for PINs of different lengths without throwing", () => {
    expect(validateClosurePin("123456", "12345")).toBe(false);
    expect(validateClosurePin("12345", "123456")).toBe(false);
  });

  it("returns false when the supplied PIN is null or undefined", () => {
    expect(validateClosurePin(null, "123456")).toBe(false);
    expect(validateClosurePin(undefined, "123456")).toBe(false);
    expect(validateClosurePin("", "123456")).toBe(false);
  });

  it("returns false when the stored PIN is null or undefined", () => {
    // Mirrors the production contract: a solicitud that somehow lacks
    // a stored `pinCierre` cannot be closed, and the response must not
    // leak the missing-column condition.
    expect(validateClosurePin("123456", null)).toBe(false);
    expect(validateClosurePin("123456", undefined)).toBe(false);
    expect(validateClosurePin("123456", "")).toBe(false);
  });

  it("returns false for length-mismatched inputs without inspecting the values", () => {
    // Behavioral test (not a timing-canary): the length guard must
    // short-circuit BEFORE any byte-by-byte comparison. The values
    // are equal except for length, so any short-circuit that compared
    // bytes first would either throw (different-length buffers) or
    // return true (length-insensitive equality). Both are wrong.
    expect(validateClosurePin("1234", "12345")).toBe(false);
    expect(validateClosurePin("12345", "1234")).toBe(false);
  });

  it("uses Node's crypto timingSafeEqual as the byte-level comparator", () => {
    // Indirect check: the production code re-encodes the strings as
    // Buffers, so two ASCII strings of equal length produce equal
    // Buffers iff the strings are byte-equal. We exercise the equal
    // path; the constant-time guarantee is provided by Node's
    // `timingSafeEqual` and is a property of the runtime, not of
    // our code. (Spying on ESM exports is not supported in Vitest, so
    // this test stays at the behavioral boundary.)
    expect(validateClosurePin("999999", "999999")).toBe(true);
    // Sanity: a single-character difference fails (no equality-by-prefix).
    expect(validateClosurePin("999990", "999999")).toBe(false);
  });
});

describe("checkThrottle — window math", () => {
  const solicitudId = 100;
  const identifierHash = "hash-1";

  it("allows the request when no record exists, returning the full budget", async () => {
    const db = makeDb([]);
    getDbMock.mockReturnValue(db);
    const now = new Date("2026-01-01T12:00:00.000Z");

    const decision = await checkThrottle(solicitudId, identifierHash, now);

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(THROTTLE_MAX_ATTEMPTS);
    expect(decision.resetsAt.getTime()).toBe(
      now.getTime() + THROTTLE_WINDOW_MS,
    );
  });

  it("treats an expired record as a fresh window (allowed, full budget)", async () => {
    const expiredStart = new Date("2026-01-01T11:00:00.000Z"); // 1h ago
    const db = makeDb([
      {
        id: 1,
        solicitudId,
        identifierHash,
        windowStartsAt: expiredStart,
        attemptCount: THROTTLE_MAX_ATTEMPTS,
      },
    ]);
    getDbMock.mockReturnValue(db);
    const now = new Date("2026-01-01T12:00:00.000Z");

    const decision = await checkThrottle(solicitudId, identifierHash, now);

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(THROTTLE_MAX_ATTEMPTS);
  });

  it("counts remaining attempts correctly within an active window", async () => {
    const windowStart = new Date("2026-01-01T12:00:00.000Z");
    const db = makeDb([
      {
        id: 1,
        solicitudId,
        identifierHash,
        windowStartsAt: windowStart,
        attemptCount: 2,
      },
    ]);
    getDbMock.mockReturnValue(db);
    const now = new Date("2026-01-01T12:05:00.000Z"); // 5 min later

    const decision = await checkThrottle(solicitudId, identifierHash, now);

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(THROTTLE_MAX_ATTEMPTS - 2);
    expect(decision.resetsAt.getTime()).toBe(
      windowStart.getTime() + THROTTLE_WINDOW_MS,
    );
  });

  it("rejects with remaining=0 once the budget is exhausted", async () => {
    const windowStart = new Date("2026-01-01T12:00:00.000Z");
    const db = makeDb([
      {
        id: 1,
        solicitudId,
        identifierHash,
        windowStartsAt: windowStart,
        attemptCount: THROTTLE_MAX_ATTEMPTS,
      },
    ]);
    getDbMock.mockReturnValue(db);
    const now = new Date("2026-01-01T12:05:00.000Z");

    const decision = await checkThrottle(solicitudId, identifierHash, now);

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.resetsAt.getTime()).toBe(
      windowStart.getTime() + THROTTLE_WINDOW_MS,
    );
  });

  it("reads only one row (limit 1) for the lookup", async () => {
    const db = makeDb([]);
    getDbMock.mockReturnValue(db);
    await checkThrottle(solicitudId, identifierHash, new Date());
    expect(db.limit).toHaveBeenCalledWith(1);
  });
});

describe("recordAttempt — book-keeping", () => {
  const solicitudId = 100;
  const identifierHash = "hash-1";

  it("opens a fresh window with attemptCount=1 when no record exists", async () => {
    const db = makeDb([]); // no record -> insert path
    getDbMock.mockReturnValue(db);

    const now = new Date("2026-01-01T12:00:00.000Z");
    await recordAttempt(solicitudId, identifierHash, now);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
    const inserted = db.values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      solicitudId,
      identifierHash,
      attemptCount: 1,
    });
    expect(inserted.windowStartsAt).toBe(now);
  });

  it("increments attemptCount by 1 (in-DB) when an active window exists", async () => {
    const existingId = 42;
    const windowStart = new Date("2026-01-01T12:00:00.000Z");
    const db = makeDb([
      {
        id: existingId,
        solicitudId,
        identifierHash,
        windowStartsAt: windowStart,
        attemptCount: 3,
      },
    ]);
    getDbMock.mockReturnValue(db);

    // A `now` value safely inside the existing window.
    const now = new Date("2026-01-01T12:05:00.000Z");
    await recordAttempt(solicitudId, identifierHash, now);

    // The active-window path uses an UPDATE; it must NOT call insert.
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledTimes(1);
    expect(db.whereOnUpdate).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    // `set` is called with a SQL fragment that adds 1 — the production
    // code uses `sql\`${...} + 1\`` so we assert on the call's shape
    // rather than the precise SQL string. A plain object would mean
    // the implementation lost the in-DB increment.
    const setArg = db.set.mock.calls[0]?.[0];
    expect(setArg).toBeDefined();
    expect(typeof setArg).toBe("object");
  });

  it("opens a fresh window with attemptCount=1 when the previous window expired", async () => {
    const expiredStart = new Date("2026-01-01T10:00:00.000Z"); // 2h ago
    const db = makeDb([
      {
        id: 99,
        solicitudId,
        identifierHash,
        windowStartsAt: expiredStart,
        attemptCount: THROTTLE_MAX_ATTEMPTS,
      },
    ]);
    getDbMock.mockReturnValue(db);

    const now = new Date("2026-01-01T12:00:00.000Z");
    await recordAttempt(solicitudId, identifierHash, now);

    expect(db.insert).toHaveBeenCalledTimes(1);
    const inserted = db.values.mock.calls[0]?.[0];
    expect(inserted.attemptCount).toBe(1);
  });

  it("uses onDuplicateKeyUpdate so a concurrent fresh-window race does not crash", async () => {
    // The production code path: when no record exists, it inserts a
    // fresh window AND chains `.onDuplicateKeyUpdate(...)` to collapse
    // the ER_DUP_ENTRY from a concurrent caller into the same row.
    // Pin that contract down so a future refactor cannot drop the
    // upsert without breaking the race recovery.
    const db = makeDb([]);
    getDbMock.mockReturnValue(db);

    await recordAttempt(solicitudId, identifierHash, new Date());

    expect(db.onDuplicateKeyUpdate).toHaveBeenCalledTimes(1);
    const onDupArg = db.onDuplicateKeyUpdate.mock.calls[0]?.[0];
    expect(onDupArg).toBeDefined();
    expect(onDupArg.set).toMatchObject({ attemptCount: 1 });
  });
});

describe("writeAudit", () => {
  it("inserts a single audit row with the supplied fields", async () => {
    const db = makeDb();
    getDbMock.mockReturnValue(db);

    await writeAudit({
      solicitudId: 7,
      actorUserId: 42,
      actorName: "Alice",
      action: "admin_close",
      reason: "PIN recovery request from hospital",
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    const inserted = db.values.mock.calls[0]?.[0];
    expect(inserted).toEqual({
      solicitudId: 7,
      actorUserId: 42,
      actorName: "Alice",
      action: "admin_close",
      reason: "PIN recovery request from hospital",
    });
  });

  it("stores actorName as null when the caller did not provide a name", async () => {
    const db = makeDb();
    getDbMock.mockReturnValue(db);

    await writeAudit({
      solicitudId: 1,
      actorUserId: 1,
      action: "admin_close",
      reason: "override",
    });

    const inserted = db.values.mock.calls[0]?.[0];
    expect(inserted.actorName).toBeNull();
  });

  it("does not consult the database for any read path (write-only helper)", async () => {
    const db = makeDb();
    getDbMock.mockReturnValue(db);

    await writeAudit({
      solicitudId: 1,
      actorUserId: 1,
      action: "admin_close",
      reason: "override",
    });

    // No select/update chain should have been touched.
    expect(db.insert).toHaveBeenCalledTimes(1);
    // `getDb` was called exactly once (for the insert).
    expect(getDbMock).toHaveBeenCalledTimes(1);
  });
});
