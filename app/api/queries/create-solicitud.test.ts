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

  it("inserts a solicitud and returns { id, pinGestion }", async () => {
    randomIntMock.mockReturnValueOnce(424242);
    valuesMock.mockResolvedValueOnce([{ insertId: 99 }]);

    const result = await createSolicitud(baseInput);

    expect(result).toEqual({ id: 99, pinGestion: "424242" });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("applies default urgencia and estatus on insert", async () => {
    randomIntMock.mockReturnValueOnce(1);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    await createSolicitud(baseInput);

    const inserted = valuesMock.mock.calls[0]?.[0];
    expect(inserted.urgencia).toBe("moderado");
    expect(inserted.estatus).toBe("activo");
  });

  it("preserves caller-supplied urgencia when provided", async () => {
    randomIntMock.mockReturnValueOnce(1);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    await createSolicitud({ ...baseInput, urgencia: "critico" });

    const inserted = valuesMock.mock.calls[0]?.[0];
    expect(inserted.urgencia).toBe("critico");
  });

  it("retries with a fresh PIN when the insert raises ER_DUP_ENTRY", async () => {
    randomIntMock
      .mockReturnValueOnce(111111) // first PIN collides
      .mockReturnValueOnce(222222); // second PIN wins
    valuesMock
      .mockRejectedValueOnce({ errno: 1062, code: "ER_DUP_ENTRY" })
      .mockResolvedValueOnce([{ insertId: 7 }]);

    const result = await createSolicitud(baseInput);

    expect(result).toEqual({ id: 7, pinGestion: "222222" });
    expect(valuesMock).toHaveBeenCalledTimes(2);
  });

  it("retries up to MAX_PIN_RETRIES attempts and then throws PinCollisionError", async () => {
    randomIntMock.mockReturnValue(555555);
    valuesMock.mockRejectedValue({ errno: 1062, code: "ER_DUP_ENTRY" });

    await expect(createSolicitud(baseInput)).rejects.toBeInstanceOf(
      PinCollisionError,
    );
    expect(valuesMock).toHaveBeenCalledTimes(MAX_PIN_RETRIES);
  });

  it("propagates non-duplicate errors without retrying", async () => {
    randomIntMock.mockReturnValueOnce(1);
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

  it("returns a unique PIN to every concurrent caller (no shared state)", async () => {
    // Distinct PIN per call. Use a monotonically incrementing counter so
    // the randomInt mock never depends on a shared, mutable array; the
    // production code path is identical regardless of how PINs arrive.
    let nextPin = 111111;
    randomIntMock.mockImplementation(() => nextPin++);
    valuesMock.mockImplementation(() =>
      Promise.resolve([{ insertId: Math.floor(Math.random() * 1_000_000) }]),
    );

    const inputs = Array.from({ length: 5 }, (_, i) => ({
      ...baseInput,
      telefono: `+58414${1000000 + i}`,
    }));
    const results = await Promise.all(inputs.map((input) => createSolicitud(input)));

    // All five callers receive a PIN, and every PIN is unique — no two
    // concurrent creates accidentally shared the same generated value.
    expect(results).toHaveLength(5);
    const returnedPins = results.map((r) => r.pinGestion);
    expect(new Set(returnedPins).size).toBe(5);
    expect(returnedPins.sort()).toEqual([
      "111111",
      "111112",
      "111113",
      "111114",
      "111115",
    ]);
    expect(valuesMock).toHaveBeenCalledTimes(5);
  });

  it("recovers from a simulated race by retrying with a fresh PIN", async () => {
    // Two concurrent calls happen to draw the same first PIN. The unique
    // index will reject the second insert with ER_DUP_ENTRY, and the
    // bounded retry must re-draw and succeed — so the final PINs MUST
    // differ.
    randomIntMock
      .mockReturnValueOnce(123456) // call A: first try
      .mockReturnValueOnce(123456) // call B: first try (will collide)
      .mockReturnValueOnce(654321) // call A: retry (succeeds)
      .mockReturnValueOnce(789012); // call B: retry (succeeds)

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

    // Both must end with non-colliding PINs, and they must be different
    // from each other — a race that re-uses the original PIN would
    // regress to a permanent duplicate-key loop.
    expect(a.pinGestion).toBe("654321");
    expect(b.pinGestion).toBe("789012");
    expect(a.pinGestion).not.toBe(b.pinGestion);
    expect(valuesMock).toHaveBeenCalledTimes(4);
  });

  it("exhausts retries deterministically when every concurrent attempt collides", async () => {
    // All concurrent callers draw the same PIN and every insert attempt
    // hits the duplicate-index. Each call must reach MAX_PIN_RETRIES
    // attempts and reject with PinCollisionError — never hang, never
    // silently succeed with a duplicate PIN.
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
    // colliding PIN and exhausts its retries, the other two draw unique
    // safe PINs and succeed. The expected outcomes are deterministic
    // because the randomInt + values mock queues are aligned to the
    // exact call order (3 sync initial calls, then 5 retries from the
    // first caller's catch path).
    randomIntMock
      .mockReturnValueOnce(400000) // call 1 initial (will collide)
      .mockReturnValueOnce(500002) // call 2 initial (safe)
      .mockReturnValueOnce(500003) // call 3 initial (safe)
      .mockReturnValueOnce(400000) // call 1 retry 1 (still collides)
      .mockReturnValueOnce(400000) // call 1 retry 2
      .mockReturnValueOnce(400000) // call 1 retry 3
      .mockReturnValueOnce(400000) // call 1 retry 4
      .mockReturnValueOnce(400000); // call 1 retry 5 (final attempt)

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
    // affect the others — each call has its own PIN, its own retry
    // counter, and its own outcome.
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(PinCollisionError);
    }
    // The two successful calls each carry a unique non-colliding PIN.
    const fulfilledPins = new Set(
      fulfilled.map((o) => (o.status === "fulfilled" ? o.value.pinGestion : "")),
    );
    expect(fulfilledPins.size).toBe(2);
    for (const pin of fulfilledPins) {
      expect(pin).not.toBe("400000");
    }
  });
});
