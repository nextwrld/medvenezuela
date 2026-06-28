import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks: vi.mock factories run before the module under test, so
// any state they reference must also be hoisted.
const { randomIntMock, getDbMock, insertMock, valuesMock } = vi.hoisted(() => {
  const randomIntMock = vi.fn();
  const getDbMock = vi.fn();
  const insertMock = vi.fn();
  const valuesMock = vi.fn();
  return { randomIntMock, getDbMock, insertMock, valuesMock };
});

vi.mock("node:crypto", () => ({
  randomInt: randomIntMock,
}));

vi.mock("./connection", () => ({
  getDb: getDbMock,
}));

import {
  generatePin,
  isDuplicateKeyError,
  createSolicitud,
  PinCollisionError,
  MAX_PIN_RETRIES,
} from "./create-solicitud";

beforeEach(() => {
  randomIntMock.mockReset();
  getDbMock.mockReset();
  insertMock.mockReset();
  valuesMock.mockReset();
  getDbMock.mockReturnValue({ insert: insertMock });
  insertMock.mockReturnValue({ values: valuesMock });
});

describe("generatePin", () => {
  it("returns a zero-padded 6-digit string when randomInt yields 0", () => {
    randomIntMock.mockReturnValueOnce(0);
    expect(generatePin()).toBe("000000");
  });

  it("returns a zero-padded 6-digit string when randomInt yields 999999", () => {
    randomIntMock.mockReturnValueOnce(999999);
    expect(generatePin()).toBe("999999");
  });

  it("pads to exactly 6 characters for small values", () => {
    randomIntMock.mockReturnValueOnce(42);
    expect(generatePin()).toBe("000042");
  });

  it("uses randomInt with the documented range", () => {
    randomIntMock.mockReturnValueOnce(123456);
    generatePin();
    expect(randomIntMock).toHaveBeenCalledWith(0, 1_000_000);
  });
});

describe("isDuplicateKeyError", () => {
  it("matches MySQL ER_DUP_ENTRY by errno 1062", () => {
    expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
  });

  it("matches MySQL ER_DUP_ENTRY by code string", () => {
    expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
  });

  it("rejects unrelated MySQL errors (ER_PARSE_ERROR)", () => {
    expect(isDuplicateKeyError({ errno: 1064, code: "ER_PARSE_ERROR" })).toBe(
      false,
    );
  });

  it("rejects null / undefined / strings so the type contract holds", () => {
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError("ER_DUP_ENTRY")).toBe(false);
  });
});

describe("createSolicitud", () => {
  const baseInput = {
    medicamento: "Amoxicilina",
    principioActivo: "Amoxicilina",
    cantidad: "20",
    hospital: "Hospital Central",
    estado: "Distrito Capital",
    ciudad: "Caracas",
    telefono: "+584141234567",
    nombreSolicitante: "Dr. Pérez",
    rolSolicitante: "medico" as const,
  };

  // `createSolicitud` now consumes TWO `randomInt` draws per attempt
  // (one for `pinGestion`, one for `pinCierre`). The helpers below
  // queue the two values for the next attempt in a single call so the
  // per-test mock setup stays legible. Returning a separate pair for
  // each attempt also makes collision-retry tests trivial to read.
  const queueAttempt = (gestion: number, cierre: number) => {
    randomIntMock.mockReturnValueOnce(gestion).mockReturnValueOnce(cierre);
  };

  it("inserts a solicitud and returns { id, pinGestion, pinCierre }", async () => {
    queueAttempt(424242, 121212);
    valuesMock.mockResolvedValueOnce([{ insertId: 99 }]);

    const result = await createSolicitud(baseInput);

    expect(result).toEqual({ id: 99, pinGestion: "424242", pinCierre: "121212" });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("returns both PINs as zero-padded 6-digit strings", async () => {
    queueAttempt(7, 999999);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    const result = await createSolicitud(baseInput);

    expect(result.pinGestion).toMatch(/^\d{6}$/);
    expect(result.pinCierre).toMatch(/^\d{6}$/);
    expect(result.pinGestion).toBe("000007");
    expect(result.pinCierre).toBe("999999");
  });

  it("returns pinGestion and pinCierre as distinct values on a single attempt", async () => {
    // Even when the two `randomInt` calls happen to return equal values
    // in this mock setup, the production generator draws two independent
    // samples — so the two returned PINs MAY coincide only by astronomically
    // rare chance. This test asserts the values are sourced independently
    // (two randomInt calls, two separate values) and not, e.g., aliased.
    queueAttempt(424242, 868686);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    const result = await createSolicitud(baseInput);

    expect(result.pinGestion).toBe("424242");
    expect(result.pinCierre).toBe("868686");
    expect(result.pinGestion).not.toBe(result.pinCierre);
    // The contract: two independent draws. Calling `randomInt` twice
    // per attempt is the only way the closure credential can be
    // re-rolled on a gestion-PIN collision without leaking the prior
    // draw; pin that down.
    expect(randomIntMock).toHaveBeenCalledTimes(2);
  });

  it("applies default urgencia and estatus on insert", async () => {
    queueAttempt(1, 2);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    await createSolicitud(baseInput);

    const inserted = valuesMock.mock.calls[0]?.[0];
    expect(inserted.urgencia).toBe("moderado");
    expect(inserted.estatus).toBe("activo");
    // Both PINs land on the same insert payload, paired exactly with
    // the values returned to the caller.
    expect(inserted.pinGestion).toBe("000001");
    expect(inserted.pinCierre).toBe("000002");
  });

  it("preserves caller-supplied urgencia when provided", async () => {
    queueAttempt(1, 2);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    await createSolicitud({ ...baseInput, urgencia: "critico" });

    const inserted = valuesMock.mock.calls[0]?.[0];
    expect(inserted.urgencia).toBe("critico");
  });

  it("retries with fresh PINs for both columns when the insert raises ER_DUP_ENTRY", async () => {
    queueAttempt(111111, 222222); // first attempt — pinGestion collides
    queueAttempt(333333, 444444); // second attempt — both fresh, succeeds
    valuesMock
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" })
      .mockResolvedValueOnce([{ insertId: 7 }]);

    const result = await createSolicitud(baseInput);

    expect(result).toEqual({
      id: 7,
      pinGestion: "333333",
      pinCierre: "444444",
    });
    expect(valuesMock).toHaveBeenCalledTimes(2);
  });

  it("regenerates pinCierre too on collision retry (not just pinGestion)", async () => {
    // This test pins the invariant that the closure credential is also
    // re-drawn on a gestion-PIN collision, so a previously-attempted
    // closure value never leaks forward into the next insert.
    queueAttempt(100001, 100002); // first attempt (gestion collides)
    queueAttempt(200003, 200004); // retry
    valuesMock
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" })
      .mockResolvedValueOnce([{ insertId: 1 }]);

    const result = await createSolicitud(baseInput);

    expect(result.pinCierre).toBe("200004");
    expect(result.pinCierre).not.toBe("100002");
  });

  it("retries up to MAX_PIN_RETRIES attempts and then throws PinCollisionError", async () => {
    // The setup uses 2 randomInt draws (one for each PIN). Each of the
    // 5 retry iterations re-uses 2 more, so the production code makes
    // 12 randomInt calls before throwing. Queue 6 attempts (12 calls)
    // to keep the mock queue non-empty through the final retry.
    queueAttempt(555555, 666666); // initial setup
    queueAttempt(555555, 666666); // after attempt 0 catch
    queueAttempt(555555, 666666); // after attempt 1 catch
    queueAttempt(555555, 666666); // after attempt 2 catch
    queueAttempt(555555, 666666); // after attempt 3 catch
    queueAttempt(555555, 666666); // after attempt 4 catch
    valuesMock.mockRejectedValue({ errno: 1062, code: "ER_DUP_ENTRY" });

    await expect(createSolicitud(baseInput)).rejects.toBeInstanceOf(
      PinCollisionError,
    );
    expect(valuesMock).toHaveBeenCalledTimes(MAX_PIN_RETRIES);
  });

  it("propagates non-duplicate errors without retrying", async () => {
    queueAttempt(1, 2);
    const fatal = Object.assign(new Error("connection lost"), {
      errno: 2002,
      code: "ECONNREFUSED",
    });
    valuesMock.mockRejectedValueOnce(fatal);

    await expect(createSolicitud(baseInput)).rejects.toBe(fatal);
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Concurrency / parallel request simulation ──────────────────────────
//
// These tests prove the bounded-retry + unique-index contract holds when
// multiple createSolicitud calls race against each other. They use
// Promise.all to drive the calls concurrently against a shared mocked
// insert chain; the real production code does the same against a real
// MySQL pool, so any divergence here would also be a real-world bug.
//
// With the split-PIN refactor, each attempt consumes TWO `randomInt`
// draws. The mock helper below yields one pair per attempt so the
// per-caller test stays readable; the concurrent assertions still hold
// because the counter advances independently for each `randomInt` call.

describe("createSolicitud — concurrent / parallel requests", () => {
  const baseInput = {
    medicamento: "Amoxicilina",
    principioActivo: "Amoxicilina",
    cantidad: "20",
    hospital: "Hospital Central",
    estado: "Distrito Capital",
    ciudad: "Caracas",
    telefono: "+584141234567",
    nombreSolicitante: "Dr. Pérez",
    rolSolicitante: "medico" as const,
  };

  it("returns unique PINs to every concurrent caller (no shared state)", async () => {
    // Two independent counters so the assertions can distinguish the
    // two columns. pinGestion uses odd numbers, pinCierre uses even
    // numbers — both advance per `randomInt` call. The flag toggles
    // per call so the closure always knows which column it is feeding.
    let nextValue = 100001;
    let isGestion = true;
    randomIntMock.mockImplementation(() => {
      const value = nextValue++;
      // Each attempt alternates: gestion (odd) then cierre (even).
      const incremented = isGestion ? value : value;
      isGestion = !isGestion;
      return incremented;
    });

    valuesMock.mockImplementation(() =>
      Promise.resolve([{ insertId: Math.floor(Math.random() * 1_000_000) }]),
    );

    const inputs = Array.from({ length: 5 }, (_, i) => ({
      ...baseInput,
      telefono: `+58414${1000000 + i}`,
    }));
    const results = await Promise.all(inputs.map((input) => createSolicitud(input)));

    // All five callers receive BOTH PINs, and every value is unique —
    // no two concurrent creates accidentally shared either credential.
    expect(results).toHaveLength(5);
    const returnedGestion = results.map((r) => r.pinGestion);
    const returnedCierre = results.map((r) => r.pinCierre);
    expect(new Set(returnedGestion).size).toBe(5);
    expect(new Set(returnedCierre).size).toBe(5);
    expect(new Set([...returnedGestion, ...returnedCierre]).size).toBe(10);
    // Each call drew its two PINs from a single counter (odd then
    // even), so the two values a single caller received are visibly
    // distinct — guarding against an aliasing bug that would hand
    // back the same value twice.
    for (const r of results) {
      expect(Number(r.pinGestion) % 2).toBe(1);
      expect(Number(r.pinCierre) % 2).toBe(0);
      expect(r.pinGestion).not.toBe(r.pinCierre);
    }
    expect(valuesMock).toHaveBeenCalledTimes(5);
  });

  it("recovers from a simulated race by retrying with fresh PINs", async () => {
    // Two concurrent calls happen to draw the same first gestion PIN.
    // The unique index will reject the second insert with ER_DUP_ENTRY,
    // and the bounded retry must re-draw BOTH PINs and succeed — so
    // the final gestion PINs MUST differ. The cierre PINs come from
    // the same queue, so they too must end up distinct.
    randomIntMock
      .mockReturnValueOnce(123456) // call A: gestion (collides)
      .mockReturnValueOnce(900001) // call A: cierre
      .mockReturnValueOnce(123456) // call B: gestion (collides)
      .mockReturnValueOnce(900002) // call B: cierre
      .mockReturnValueOnce(654321) // call A retry: gestion
      .mockReturnValueOnce(900003) // call A retry: cierre
      .mockReturnValueOnce(789012) // call B retry: gestion
      .mockReturnValueOnce(900004); // call B retry: cierre

    // First two inserts collide, next two succeed.
    valuesMock
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" })
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" })
      .mockResolvedValueOnce([{ insertId: 11 }])
      .mockResolvedValueOnce([{ insertId: 22 }]);

    const [a, b] = await Promise.all([
      createSolicitud({ ...baseInput, telefono: "+584141111111" }),
      createSolicitud({ ...baseInput, telefono: "+584142222222" }),
    ]);

    // Both must end with non-colliding gestion PINs, and they must
    // be different from each other — a race that re-uses the original
    // PIN would regress to a permanent duplicate-key loop.
    expect(a.pinGestion).toBe("654321");
    expect(b.pinGestion).toBe("789012");
    expect(a.pinGestion).not.toBe(b.pinGestion);
    // And the cierre PINs landed on their queued values, distinct too.
    expect(a.pinCierre).toBe("900003");
    expect(b.pinCierre).toBe("900004");
    expect(a.pinCierre).not.toBe(b.pinCierre);
    expect(valuesMock).toHaveBeenCalledTimes(4);
  });

  it("exhausts retries deterministically when every concurrent attempt collides", async () => {
    // All concurrent callers draw the same gestion PIN and every
    // insert attempt hits the duplicate-index. Each call must reach
    // MAX_PIN_RETRIES attempts and reject with PinCollisionError —
    // never hang, never silently succeed with a duplicate PIN.
    randomIntMock.mockReturnValue(999999);
    valuesMock.mockRejectedValue({ errno: 1062, code: "ER_DUP_ENTRY" });

    const outcomes = await Promise.allSettled([
      createSolicitud({ ...baseInput, telefono: "+584141000001" }),
      createSolicitud({ ...baseInput, telefono: "+584141000002" }),
      createSolicitud({ ...baseInput, telefono: "+584141000003" }),
    ]);

    expect(outcomes).toHaveLength(3);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") {
        expect(outcome.reason).toBeInstanceOf(PinCollisionError);
      }
    }
    // Three callers, each making MAX_PIN_RETRIES attempts.
    expect(valuesMock).toHaveBeenCalledTimes(3 * MAX_PIN_RETRIES);
  });

  it("isolates one failing concurrent request from others that succeed", async () => {
    // Mixed scenario: 3 concurrent creates; one keeps drawing the same
    // colliding gestion PIN and exhausts its retries, the other two
    // draw unique safe gestion PINs and succeed. The cierre PINs run
    // on a separate counter so the failing caller's retries still
    // produce fresh cierre values without ever colliding.
    randomIntMock
      .mockReturnValueOnce(400000) // call 1 gestion (collides)
      .mockReturnValueOnce(400010) // call 1 cierre
      .mockReturnValueOnce(500002) // call 2 gestion (safe)
      .mockReturnValueOnce(500012) // call 2 cierre
      .mockReturnValueOnce(500003) // call 3 gestion (safe)
      .mockReturnValueOnce(500013) // call 3 cierre
      .mockReturnValueOnce(400000) // call 1 retry 1 gestion (still collides)
      .mockReturnValueOnce(400020) // call 1 retry 1 cierre
      .mockReturnValueOnce(400000) // call 1 retry 2 gestion
      .mockReturnValueOnce(400030) // call 1 retry 2 cierre
      .mockReturnValueOnce(400000) // call 1 retry 3 gestion
      .mockReturnValueOnce(400040) // call 1 retry 3 cierre
      .mockReturnValueOnce(400000) // call 1 retry 4 gestion
      .mockReturnValueOnce(400050) // call 1 retry 4 cierre
      .mockReturnValueOnce(400000) // call 1 retry 5 gestion (final)
      .mockReturnValueOnce(400060); // call 1 retry 5 cierre

    valuesMock
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" }) // call 1 first
      .mockResolvedValueOnce([{ insertId: 1 }]) // call 2 first
      .mockResolvedValueOnce([{ insertId: 2 }]) // call 3 first
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" }) // call 1 retry 1
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" }) // call 1 retry 2
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" }) // call 1 retry 3
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" }) // call 1 retry 4
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" }); // call 1 retry 5

    const outcomes = await Promise.allSettled([
      createSolicitud({ ...baseInput, telefono: "+584141000001" }),
      createSolicitud({ ...baseInput, telefono: "+584141000002" }),
      createSolicitud({ ...baseInput, telefono: "+584141000003" }),
    ]);

    // Exactly 2 callers succeed and exactly 1 exhausts its retries.
    // The important property is isolation: the failure of one must not
    // affect the others — each call has its own PIN pair, its own
    // retry counter, and its own outcome.
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(PinCollisionError);
    }
    // The two successful calls each carry a unique non-colliding
    // gestion PIN, and both closure PINs are also distinct from each
    // other and from any gestion value.
    const fulfilledResults = fulfilled
      .map((o) => (o.status === "fulfilled" ? o.value : null))
      .filter((v): v is NonNullable<typeof v> => v !== null);
    expect(fulfilledResults).toHaveLength(2);
    const gestionSet = new Set(fulfilledResults.map((r) => r.pinGestion));
    const cierreSet = new Set(fulfilledResults.map((r) => r.pinCierre));
    expect(gestionSet.size).toBe(2);
    expect(cierreSet.size).toBe(2);
    for (const r of fulfilledResults) {
      expect(r.pinGestion).not.toBe("400000");
      expect(r.pinCierre).not.toBe("400000");
    }
  });
});
