import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const { createSolicitudMock, PinCollisionErrorMock } = vi.hoisted(() => {
  // The router must depend on the createSolicitud abstraction, not on
  // raw Drizzle queries. We re-implement PinCollisionError here so the
  // mock module does not import the real one (which would in turn
  // re-import its own dependencies).
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

const { getDbMock, insertMock, valuesMock } = vi.hoisted(() => {
  const getDbMock = vi.fn();
  const insertMock = vi.fn();
  const valuesMock = vi.fn();
  getDbMock.mockReturnValue({ insert: insertMock });
  return { getDbMock, insertMock, valuesMock };
});

vi.mock("./queries/connection", () => ({
  getDb: getDbMock,
}));

import { appRouter } from "./router";
import { createContext } from "./context";

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

async function callCreate(input: typeof validInput) {
  const ctx = await createContext({
    req: new Request("http://localhost/api/trpc/solicitudes.create"),
    resHeaders: new Headers(),
    info: {} as never,
  });
  const caller = appRouter.createCaller(ctx);
  return caller.solicitudes.create(input);
}

beforeEach(() => {
  createSolicitudMock.mockReset();
});

describe("solicitudesRouter.create", () => {
  it("delegates to createSolicitud and returns { id, pinGestion }", async () => {
    createSolicitudMock.mockResolvedValueOnce({
      id: 42,
      pinGestion: "111111",
    });

    const result = await callCreate(validInput);

    expect(result).toEqual({ id: 42, pinGestion: "111111" });
    expect(createSolicitudMock).toHaveBeenCalledTimes(1);
    const callArg = createSolicitudMock.mock.calls[0]?.[0];
    expect(callArg.medicamento).toBe("Amoxicilina");
    expect(callArg.rolSolicitante).toBe("medico");
  });

  it("maps PinCollisionError to a tRPC CONFLICT error", async () => {
    createSolicitudMock.mockRejectedValueOnce(
      new PinCollisionErrorMock(),
    );

    await expect(callCreate(validInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(callCreate(validInput)).rejects.toBeInstanceOf(TRPCError);
  });

  it("passes caller-provided urgencia through unchanged", async () => {
    createSolicitudMock.mockResolvedValueOnce({
      id: 1,
      pinGestion: "222222",
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
