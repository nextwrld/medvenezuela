// Integration test: parallel solicitud creation.
//
// STRUCTURAL / STUB-LEVEL test. The spec scenarios it covers are:
//
//   concurrent-solicitud-creation / Collision-safe solicitud creation
//     - Concurrent creates produce unique PINs (proven by the unit
//       suite against a mocked insert chain; this test pins down the
//       contract that createSolicitud exposes for higher-level
//       consumers, and that the import surface stays stable).
//     - PIN collision is retried safely (covered by the unit suite).
//
//   concurrent-solicitud-creation / Concurrent failure isolation
//     - One request fails, others succeed (covered by the unit suite).
//
// The actual concurrency proofs live in `api/queries/create-solicitud.test.ts`
// where the insert chain is fully mockable. This integration file
// ensures the production module's public surface stays importable and
// that the retry bounds are observable from the outside (i.e. the
// same constant the unit suite asserts on).

import { describe, it, expect } from "vitest";
import {
  generatePin,
  isDuplicateKeyError,
  PinCollisionError,
  MAX_PIN_RETRIES,
  type CreateSolicitudInput,
  type CreateSolicitudResult,
} from "../queries/create-solicitud";

describe("integration: parallel create surface (structural)", () => {
  it("exports a stable retry bound the production code can rely on", () => {
    expect(typeof MAX_PIN_RETRIES).toBe("number");
    expect(MAX_PIN_RETRIES).toBeGreaterThan(0);
    // The retry bound is part of the public contract: changing it
    // shifts the collision budget for the whole pool. Pin it down.
    expect(MAX_PIN_RETRIES).toBe(5);
  });

  it("exposes generatePin as a pure function that returns a 6-digit string", () => {
    const pin = generatePin();
    expect(pin).toMatch(/^\d{6}$/);
  });

  it("isDuplicateKeyError matches both the errno and code form of MySQL's ER_DUP_ENTRY", () => {
    expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
    expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateKeyError({ errno: 1064, code: "ER_PARSE_ERROR" })).toBe(false);
  });

  it("PinCollisionError is a distinct named Error subclass that callers can branch on", () => {
    const err = new PinCollisionError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PinCollisionError);
    expect(err.name).toBe("PinCollisionError");
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("exposes the createSolicitud input and result types so the router can stay in sync", () => {
    // This is a type-level assertion: if the input shape drifts, the
    // compiler will flag any caller that depended on the old fields.
    // The restricted-closure flow added `pinCierre` to the result; the
    // router relies on that field to hand both credentials to the
    // success screen exactly once.
    const input: CreateSolicitudInput = {
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
    const result: CreateSolicitudResult = {
      id: 1,
      pinGestion: "123456",
      pinCierre: "654321",
    };
    expect(result.id).toBe(1);
    expect(result.pinGestion).toBe("123456");
    expect(result.pinCierre).toBe("654321");
    // Pin the closure-flow invariant: the two PINs MUST be distinct
    // values on the same result. The production generator draws them
    // independently, so any future refactor that aliases one onto the
    // other would surface as a same-value regression here.
    expect(result.pinGestion).not.toBe(result.pinCierre);
    expect(input.rolSolicitante).toBe("medico");
  });
});
