import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { User } from "@db/schema";

// ─── Module-level mocks ───────────────────────────────────────────────
//
// The router must depend on the createSolicitud abstraction, not on raw
// Drizzle queries. We re-implement PinCollisionError here so the mock
// module does not import the real one (which would in turn re-import
// its own dependencies).
const { createSolicitudMock, PinCollisionErrorMock } = vi.hoisted(() => {
  class PinCollisionErrorMock extends Error {
    constructor() {
      super("Failed to generate unique PIN after maximum retries");
      this.name = "PinCollisionError";
    }
  }
  const createSolicitudMock = vi.fn();
  return { createSolicitudMock, PinCollisionErrorMock };
});

vi.mock("./queries/create-solicitud", () => ({
  createSolicitud: createSolicitudMock,
  PinCollisionError: PinCollisionErrorMock,
  MAX_PIN_RETRIES: 5,
}));

// `getDb` must return a single `db` object that supports `select`,
// `update`, and `insert` chains — every router operation uses at least
// one. The factory below returns a complete, chainable mock so the
// production `db.select({...}).from(...).where(...).limit(...)` style
// call survives intact.
const { getDbMock, makeDb } = vi.hoisted(() => {
  function makeDb(rowFixture: {
    selectRows?: unknown[];
    selectResults?: unknown[][];
  } = {}) {
    const { selectRows = [], selectResults } = rowFixture;
    const readQueue = [...(selectResults ?? [selectRows])];

    function nextRows() {
      return readQueue.shift() ?? [];
    }

    let where = vi.fn();
    let orderBy = vi.fn();
    let limit = vi.fn();
    let offset = vi.fn();

    function makeSelectChain(rows: unknown[]) {
      const chain = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        offset: vi.fn().mockResolvedValue(rows),
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve, reject),
      };

      where = chain.where;
      orderBy = chain.orderBy;
      limit = chain.limit;
      offset = chain.offset;

      return chain;
    }

    const from = vi.fn(() => makeSelectChain(nextRows()));
    const select = vi.fn(() => ({ from }));

    // Update chain: `db.update(...).set({...}).where(...)` — terminal
    // resolves to `undefined` to mirror Drizzle's `await updateResult`.
    const updWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: updWhere });
    const update = vi.fn().mockReturnValue({ set });

    return {
      select,
      from,
      get where() {
        return where;
      },
      get orderBy() {
        return orderBy;
      },
      get limit() {
        return limit;
      },
      get offset() {
        return offset;
      },
      update,
      set,
      updWhere,
    };
  }
  const getDbMock = vi.fn();
  return { getDbMock, makeDb };
});

vi.mock("./queries/connection", () => ({
  getDb: getDbMock,
}));

// The closure-security helpers are pure functions (modulo a DB call to
// `checkThrottle`/`recordAttempt`/`writeAudit` which themselves mock
// `getDb` — but in the router tests we control the throttle / record
// helpers directly so we don't need the inner DB to behave). The
// `hashIdentifier` helper is deterministic; we mock it to a fixed
// string so the router tests can assert it was consulted.
const { hashIdentifierMock, validateClosurePinMock, checkThrottleMock, recordAttemptMock, writeAuditMock } =
  vi.hoisted(() => ({
    hashIdentifierMock: vi.fn(() => "identifier-hash"),
    validateClosurePinMock: vi.fn(),
    checkThrottleMock: vi.fn(),
    recordAttemptMock: vi.fn(),
    writeAuditMock: vi.fn(),
  }));

vi.mock("./queries/solicitud-closure-security", () => ({
  hashIdentifier: hashIdentifierMock,
  validateClosurePin: validateClosurePinMock,
  checkThrottle: checkThrottleMock,
  recordAttempt: recordAttemptMock,
  writeAudit: writeAuditMock,
}));

// Auth boundary: control who the context thinks the request belongs to
// per test. The default (no user) is set in `beforeEach`; admin tests
// override it.
const { authenticateRequestMock } = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
}));

vi.mock("./kimi/auth", () => ({
  authenticateRequest: authenticateRequestMock,
}));

// ─── Imports (must come AFTER vi.mock) ────────────────────────────────

import { appRouter } from "./router";
import { createContext } from "./context";
import type { TrpcContext } from "./context";

// ─── Fixtures ──────────────────────────────────────────────────────────

const validInput: {
  medicamento: string;
  principioActivo: string;
  cantidad: string;
  hospital: string;
  estado: string;
  ciudad: string;
  telefono: string;
  nombreSolicitante: string;
  rolSolicitante: "medico" | "familiar" | "personal_salud";
  urgencia?: "critico" | "moderado" | "estable";
} = {
  medicamento: "Amoxicilina",
  principioActivo: "Amoxicilina",
  cantidad: "20",
  hospital: "Hospital Central",
  estado: "Distrito Capital",
  ciudad: "Caracas",
  telefono: "+584141234567",
  nombreSolicitante: "Dr. Pérez",
  rolSolicitante: "medico",
};

const baseDate = new Date("2026-01-01T12:00:00.000Z");

const adminUser: User = {
  id: 1,
  unionId: "u-admin",
  name: "Alice Admin",
  email: null,
  avatar: null,
  role: "admin",
  createdAt: baseDate,
  updatedAt: baseDate,
  lastSignInAt: baseDate,
};

const regularUser: User = {
  ...adminUser,
  id: 2,
  unionId: "u-user",
  name: "Bob User",
  role: "user",
};

// `buildContext` builds a tRPC caller with a header-aware request and
// an explicit user — bypassing `authenticateRequest` (which is mocked
// anyway) so each test can set exactly the user it needs. The
// `x-forwarded-for` header drives the throttle identifier hash, so
// tests that exercise throttle-related behavior set it explicitly.
type CallerHeaders = Record<string, string>;

function buildContext(
  user: User | undefined,
  extraHeaders: CallerHeaders = {},
): TrpcContext {
  const headers = new Headers({ ...extraHeaders });
  return {
    req: new Request("http://localhost/api/trpc/solicitudes", { headers }),
    resHeaders: new Headers(),
    user,
  };
}

function adminCaller(extraHeaders: CallerHeaders = {}) {
  return appRouter.createCaller(buildContext(adminUser, extraHeaders));
}

function userCaller(extraHeaders: CallerHeaders = {}) {
  return appRouter.createCaller(buildContext(regularUser, extraHeaders));
}

function anonCaller(extraHeaders: CallerHeaders = {}) {
  return appRouter.createCaller(buildContext(undefined, extraHeaders));
}

async function callCreate(input: typeof validInput) {
  const ctx = await createContext({
    req: new Request("http://localhost/api/trpc/solicitudes.create"),
    resHeaders: new Headers(),
    info: {} as never,
  });
  const caller = appRouter.createCaller(ctx);
  return caller.solicitudes.create(input);
}

// ─── Per-test reset ───────────────────────────────────────────────────

beforeEach(() => {
  createSolicitudMock.mockReset();
  getDbMock.mockReset();
  hashIdentifierMock.mockReset();
  validateClosurePinMock.mockReset();
  checkThrottleMock.mockReset();
  recordAttemptMock.mockReset();
  writeAuditMock.mockReset();
  authenticateRequestMock.mockReset();
  // Default: anonymous request (no user). Tests that need a user
  // override `authenticateRequestMock` before calling `createContext`.
  authenticateRequestMock.mockRejectedValue(new Error("no session"));
  // Default: closure helpers are no-ops; tests that exercise them
  // provide their own resolved/rejected values per call.
  hashIdentifierMock.mockReturnValue("identifier-hash");
  validateClosurePinMock.mockReturnValue(false);
  checkThrottleMock.mockResolvedValue({
    allowed: true,
    remaining: 5,
    resetsAt: new Date(),
  });
  recordAttemptMock.mockResolvedValue(undefined);
  writeAuditMock.mockResolvedValue(undefined);
});

// ─── create ───────────────────────────────────────────────────────────

describe("solicitudesRouter.create", () => {
  it("delegates to createSolicitud and returns { id, pinGestion, pinCierre }", async () => {
    createSolicitudMock.mockResolvedValueOnce({
      id: 42,
      pinGestion: "111111",
      pinCierre: "222222",
    });

    const result = await callCreate(validInput);

    expect(result).toEqual({ id: 42, pinGestion: "111111", pinCierre: "222222" });
    expect(createSolicitudMock).toHaveBeenCalledTimes(1);
    const callArg = createSolicitudMock.mock.calls[0]?.[0];
    expect(callArg.medicamento).toBe("Amoxicilina");
    expect(callArg.rolSolicitante).toBe("medico");
  });

  it("maps PinCollisionError to a tRPC CONFLICT error", async () => {
    createSolicitudMock.mockRejectedValueOnce(new PinCollisionErrorMock());

    await expect(callCreate(validInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(callCreate(validInput)).rejects.toBeInstanceOf(TRPCError);
  });

  it("passes caller-provided urgencia through unchanged", async () => {
    createSolicitudMock.mockResolvedValueOnce({
      id: 1,
      pinGestion: "222222",
      pinCierre: "333333",
    });

    await callCreate({ ...validInput, urgencia: "critico" });

    const callArg = createSolicitudMock.mock.calls[0]?.[0];
    expect(callArg.urgencia).toBe("critico");
  });

  it("lets non-PIN errors propagate as INTERNAL_SERVER_ERROR (tRPC default)", async () => {
    // tRPC's default error formatter wraps non-TRPCError throwables into
    // an INTERNAL_SERVER_ERROR TRPCError, so callers cannot rely on the
    // original instance. The important contract is that the router does
    // NOT swallow non-PIN errors or map them to CONFLICT.
    createSolicitudMock.mockRejectedValueOnce(new Error("connection lost"));

    await expect(callCreate(validInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      name: "TRPCError",
    });
  });
});

describe("solicitudesRouter.list", () => {
  const publicRow = {
    id: 99,
    medicamento: "Amoxicilina",
    principioActivo: "Amoxicilina",
    cantidad: "20",
    dosis: null,
    hospital: "Hospital Central",
    estado: "Distrito Capital",
    ciudad: "Caracas",
    telefono: "+584141234567",
    nombreSolicitante: "Dr. Pérez",
    rolSolicitante: "medico" as const,
    inicialesPaciente: null,
    urgencia: "moderado" as const,
    estatus: "activo" as const,
    pinGestion: "123456",
    notas: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };

  it("returns the public DTO fields for feed items", async () => {
    getDbMock.mockReturnValue(
      makeDb({
        selectResults: [[publicRow], [{ count: 1 }]],
      }),
    );

    const caller = anonCaller();
    const result = await caller.solicitudes.list({ page: 1, limit: 20 });

    expect(result).toEqual({
      items: [publicRow],
      total: 1,
      page: 1,
      totalPages: 1,
    });
    expect(result.items[0]).toHaveProperty("pinGestion");
    expect(result.items[0]).not.toHaveProperty("pinCierre");
    expect(result.items[0]).not.toHaveProperty("notasCierre");
    expect(result.items[0]).not.toHaveProperty("closedAt");
  });
});

// ─── getById — sanitized public DTO ───────────────────────────────────

describe("solicitudesRouter.getById", () => {
  // `getById` must NEVER leak either PIN. The public projection in the
  // router is an explicit `select({...})`; if a future refactor widens
  // it back to `select()` the test below would surface the regression
  // because the fixture would carry both PINs and the result would too.
  const publicRow = {
    id: 99,
    medicamento: "Amoxicilina",
    principioActivo: "Amoxicilina",
    cantidad: "20",
    dosis: null,
    hospital: "Hospital Central",
    estado: "Distrito Capital",
    ciudad: "Caracas",
    telefono: "+584141234567",
    nombreSolicitante: "Dr. Pérez",
    rolSolicitante: "medico" as const,
    inicialesPaciente: null,
    urgencia: "moderado" as const,
    estatus: "activo" as const,
    pinGestion: "123456",
    notas: null,
    createdAt: baseDate,
    updatedAt: baseDate,
    // NOTE: pinCierre / notasCierre / closedAt are intentionally absent
    // — the public DTO must NOT include closure credentials. pinGestion
    // IS included because it identifies the solicitud for management.
  };

  it("returns the public DTO with pinGestion but without closure credentials", async () => {
    getDbMock.mockReturnValue(makeDb({ selectRows: [publicRow] }));

    const caller = anonCaller();
    const result = await caller.solicitudes.getById({ id: 99 });

    expect(result).toEqual(publicRow);
    // pinGestion is intentionally public — the management code is a
    // lookup identifier, not a secret. Only pinCierre is hidden.
    expect(result).toHaveProperty("pinGestion");
    expect(result).not.toHaveProperty("pinCierre");
    expect(result).not.toHaveProperty("notasCierre");
    expect(result).not.toHaveProperty("closedAt");
  });

  it("returns null when the solicitud does not exist", async () => {
    getDbMock.mockReturnValue(makeDb({ selectRows: [] }));

    const caller = anonCaller();
    const result = await caller.solicitudes.getById({ id: 404 });

    expect(result).toBeNull();
  });

  it("uses limit 1 so the lookup is bounded even on duplicate ids", async () => {
    const db = makeDb({ selectRows: [publicRow] });
    getDbMock.mockReturnValue(db);

    const caller = anonCaller();
    await caller.solicitudes.getById({ id: 1 });

    expect(db.limit).toHaveBeenCalledWith(1);
  });
});

describe("solicitudesRouter.getByPin", () => {
  const publicRow = {
    id: 7,
    medicamento: "Insulina",
    principioActivo: "Insulina humana",
    cantidad: "2 viales",
    dosis: null,
    hospital: "Hospital de Niños",
    estado: "Miranda",
    ciudad: "Los Teques",
    telefono: "+584121112233",
    nombreSolicitante: "Ana",
    rolSolicitante: "familiar" as const,
    inicialesPaciente: "A.P.",
    urgencia: "critico" as const,
    estatus: "en_proceso" as const,
    pinGestion: "123456",
    notas: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };

  it("exposes pinGestion but not closure credentials", async () => {
    getDbMock.mockReturnValue(makeDb({ selectRows: [publicRow] }));

    const caller = anonCaller();
    const result = await caller.solicitudes.getByPin({ pin: "123456" });

    expect(result).toEqual(publicRow);
    // pinGestion is the lookup key — it's intentionally public.
    expect(result).toHaveProperty("pinGestion");
    // Closure credentials must never leak, even on the PIN lookup path.
    expect(result).not.toHaveProperty("pinCierre");
    expect(result).not.toHaveProperty("notasCierre");
    expect(result).not.toHaveProperty("closedAt");
  });
});

// ─── updateStatus — split-PIN transitions ─────────────────────────────

describe("solicitudesRouter.updateStatus", () => {
  // The router reads only the columns it needs and compares the PINs
  // in-process. The fixture below provides both PINs in the storage
  // row so the test can verify that only the relevant one is consulted
  // for each transition.
  const storedRow = {
    id: 7,
    estatus: "activo" as const,
    pinGestion: "111111",
    pinCierre: "222222",
  };

  function setupReadReturning(row: unknown) {
    getDbMock.mockReturnValue(makeDb({ selectRows: row ? [row] : [] }));
  }

  it("applies a non-terminal transition when pinGestion matches", async () => {
    setupReadReturning(storedRow);
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    const caller = anonCaller();
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "en_proceso",
    });

    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledWith({ estatus: "en_proceso" });
    // `pinCierre` is irrelevant on non-terminal paths — must not be
    // consulted at all. This is the spec's "Closure blocked with only
    // management PIN" scenario flipped on its head.
    expect(validateClosurePinMock).not.toHaveBeenCalled();
    expect(checkThrottleMock).not.toHaveBeenCalled();
  });

  it("rejects a non-terminal transition when pinGestion is wrong", async () => {
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    const caller = anonCaller();
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "WRONG",
      estatus: "en_proceso",
    });

    expect(result).toEqual({ success: false, error: "PIN incorrecto" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("blocks the terminal close when only pinGestion is supplied (no pinCierre)", async () => {
    // The spec scenario: "Closure blocked with only management PIN".
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    // Even if throttle is open, the request must NOT succeed when
    // `pinCierre` is missing — `validateClosurePin` will return false.
    validateClosurePinMock.mockReturnValue(false);

    const caller = anonCaller();
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "recibido",
      // pinCierre omitted on purpose
    });

    expect(result.success).toBe(false);
    // The PIN-attempt bookkeeping runs on every failed close attempt
    // (so the throttle can later block the same client). Pin that
    // contract: a missing/invalid `pinCierre` MUST record an attempt.
    expect(recordAttemptMock).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("applies the terminal close when pinCierre matches and throttle is open", async () => {
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    checkThrottleMock.mockResolvedValueOnce({
      allowed: true,
      remaining: 5,
      resetsAt: new Date(),
    });
    validateClosurePinMock.mockReturnValueOnce(true);

    const caller = anonCaller({ "x-forwarded-for": "203.0.113.7" });
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "recibido",
      pinCierre: "222222",
      notasCierre: "delivered at 12:00",
    });

    expect(result).toEqual({ success: true });
    // Throttle + PIN are both consulted on the terminal path; a passing
    // PIN does not record an attempt.
    expect(checkThrottleMock).toHaveBeenCalledTimes(1);
    expect(validateClosurePinMock).toHaveBeenCalledTimes(1);
    expect(recordAttemptMock).not.toHaveBeenCalled();
    // Closure metadata is written alongside the status transition.
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        estatus: "recibido",
        notasCierre: "delivered at 12:00",
        closedAt: expect.any(Date),
      }),
    );
  });

  it("applies the terminal close when pinCierre matches and notasCierre is omitted", async () => {
    // The spec scenario: "Successful closure with optional notes omitted".
    // Closure without notes MUST still succeed and persist null.
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    checkThrottleMock.mockResolvedValueOnce({
      allowed: true,
      remaining: 5,
      resetsAt: new Date(),
    });
    validateClosurePinMock.mockReturnValueOnce(true);

    const caller = anonCaller({ "x-forwarded-for": "203.0.113.8" });
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "recibido",
      pinCierre: "222222",
      // notasCierre intentionally omitted
    });

    expect(result).toEqual({ success: true });
    expect(checkThrottleMock).toHaveBeenCalledTimes(1);
    expect(validateClosurePinMock).toHaveBeenCalledTimes(1);
    expect(recordAttemptMock).not.toHaveBeenCalled();
    // The route stores null when notasCierre is not provided.
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        estatus: "recibido",
        notasCierre: null,
        closedAt: expect.any(Date),
      }),
    );
  });

  it("rejects the terminal close with throttled=true when the throttle budget is exhausted", async () => {
    // The throttle must short-circuit BEFORE the PIN is consulted —
    // checking a PIN against a known-bad-attempt budget would let
    // a slow attacker time the comparison.
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    const resetsAt = new Date("2026-01-01T12:15:00.000Z");
    checkThrottleMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetsAt,
    });

    const caller = anonCaller({ "x-forwarded-for": "203.0.113.99" });
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "recibido",
      pinCierre: "222222",
    });

    expect(result).toEqual({
      success: false,
      error: "Demasiados intentos. Intente más tarde.",
      throttled: true,
      resetsAt,
    });
    // PIN comparison is NEVER reached on a throttled request, and
    // no attempt is recorded (we already exhausted the budget).
    expect(validateClosurePinMock).not.toHaveBeenCalled();
    expect(recordAttemptMock).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("hashes the request identifier before consulting the throttle", async () => {
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    hashIdentifierMock.mockReturnValueOnce("deadbeef");
    checkThrottleMock.mockResolvedValueOnce({
      allowed: true,
      remaining: 5,
      resetsAt: new Date(),
    });
    validateClosurePinMock.mockReturnValueOnce(true);

    const caller = anonCaller({ "x-forwarded-for": "10.0.0.1" });
    await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "recibido",
      pinCierre: "222222",
    });

    expect(hashIdentifierMock).toHaveBeenCalledWith("10.0.0.1");
    expect(checkThrottleMock).toHaveBeenCalledWith(7, "deadbeef");
  });

  it("records an attempt when the supplied pinCierre is wrong", async () => {
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    checkThrottleMock.mockResolvedValueOnce({
      allowed: true,
      remaining: 5,
      resetsAt: new Date(),
    });
    validateClosurePinMock.mockReturnValueOnce(false);

    const caller = anonCaller({ "x-forwarded-for": "10.0.0.2" });
    const result = await caller.solicitudes.updateStatus({
      id: 7,
      pinGestion: "111111",
      estatus: "recibido",
      pinCierre: "WRONG",
    });

    expect(result).toEqual({ success: false, error: "PIN de cierre incorrecto" });
    expect(recordAttemptMock).toHaveBeenCalledWith(7, "identifier-hash");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns success:false when the solicitud does not exist", async () => {
    const db = makeDb({ selectRows: [] });
    getDbMock.mockReturnValue(db);

    const caller = anonCaller();
    const result = await caller.solicitudes.updateStatus({
      id: 999,
      pinGestion: "111111",
      estatus: "en_proceso",
    });

    expect(result).toEqual({ success: false, error: "Solicitud no encontrada" });
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ─── adminClose — admin override + audit ──────────────────────────────

describe("solicitudesRouter.adminClose", () => {
  const storedRow = { id: 7 };

  function setupReadReturning(row: unknown) {
    getDbMock.mockReturnValue(makeDb({ selectRows: row ? [row] : [] }));
  }

  it("rejects unauthenticated callers with UNAUTHORIZED", async () => {
    const caller = anonCaller();
    await expect(
      caller.solicitudes.adminClose({ id: 7, reason: "lost PIN" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects authenticated non-admin callers with FORBIDDEN", async () => {
    const caller = userCaller();
    await expect(
      caller.solicitudes.adminClose({ id: 7, reason: "lost PIN" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a missing reason with a Zod validation error before touching the DB", async () => {
    const caller = adminCaller();
    // Zod's `z.string().min(1)` rejects empty strings; an empty `reason`
    // therefore fails BEFORE the procedure body runs and the DB stays
    // untouched.
    await expect(
      caller.solicitudes.adminClose({ id: 7, reason: "" }),
    ).rejects.toBeInstanceOf(TRPCError);
    // No DB or audit calls should have happened.
    expect(getDbMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the solicitud does not exist (no audit row written)", async () => {
    setupReadReturning(undefined); // empty result

    const caller = adminCaller();
    await expect(
      caller.solicitudes.adminClose({ id: 404, reason: "lost PIN" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The spec's "Failed override does not create misleading audit
    // success" scenario forbids writing an audit row when the action
    // did not complete. Pin that down.
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("applies the override and writes exactly one audit row on success", async () => {
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    const caller = adminCaller();
    const result = await caller.solicitudes.adminClose({
      id: 7,
      reason: "PIN recovery request from hospital",
      notasCierre: "delivered via courier",
    });

    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        estatus: "recibido",
        notasCierre: "delivered via courier",
        closedAt: expect.any(Date),
      }),
    );
    expect(writeAuditMock).toHaveBeenCalledTimes(1);
    const auditArg = writeAuditMock.mock.calls[0]?.[0];
    expect(auditArg).toMatchObject({
      solicitudId: 7,
      actorUserId: adminUser.id,
      action: "admin_close",
      reason: "PIN recovery request from hospital",
    });
    expect(auditArg.actorName).toBe(adminUser.name);
  });

  it("stores actorName as null when the admin user has no display name", async () => {
    const db = makeDb({ selectRows: [storedRow] });
    getDbMock.mockReturnValue(db);

    const namelessAdmin: User = { ...adminUser, name: null };
    const caller = appRouter.createCaller(buildContext(namelessAdmin));
    await caller.solicitudes.adminClose({ id: 7, reason: "override" });

    const auditArg = writeAuditMock.mock.calls[0]?.[0];
    expect(auditArg.actorName).toBeNull();
  });
});
