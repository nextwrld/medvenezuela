import { randomInt } from "node:crypto";
import * as schema from "@db/schema";
import { getDb } from "./connection";

// `create-solicitud` encapsulates the safe-insert path for new solicitudes.
// The previous implementation did a check-then-insert race; this one
// generates a six-digit PIN with `crypto.randomInt`, inserts directly,
// and relies on the unique index (`solicitudes_pin_gestion_unique`) plus
// bounded retry to survive the rare collision. The retry count is fixed
// so retry exhaustion becomes a deterministic, testable failure mode.

export const MAX_PIN_RETRIES = 5;
const PIN_MIN = 0;
const PIN_MAX = 1_000_000; // exclusive upper bound -> range [0, 999_999]
const PIN_FORMAT_LENGTH = 6;

export class PinCollisionError extends Error {
  constructor() {
    super("Failed to generate unique PIN after maximum retries");
    this.name = "PinCollisionError";
  }
}

export function generatePin(): string {
  // `randomInt` is a CSPRNG, unlike `Math.random`. The PIN space is six
  // digits; with up to ~10^6 values the birthday-bound collision
  // probability is negligible for any realistic concurrent creation rate.
  return randomInt(PIN_MIN, PIN_MAX).toString().padStart(PIN_FORMAT_LENGTH, "0");
}

export function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { errno?: number; code?: string };
  return e.errno === 1062 || e.code === "ER_DUP_ENTRY";
}

export interface CreateSolicitudInput {
  medicamento: string;
  principioActivo: string;
  cantidad: string;
  dosis?: string;
  hospital: string;
  estado: string;
  ciudad: string;
  telefono: string;
  nombreSolicitante: string;
  rolSolicitante: "medico" | "familiar" | "personal_salud";
  inicialesPaciente?: string;
  urgencia?: "critico" | "moderado" | "estable";
  notas?: string;
}

// `CreateSolicitudResult` carries both credentials the closure-restricted
// flow requires. `pinCierre` is returned exactly once to the creator on
// the success screen and is never re-exposed by the public detail or
// management endpoints — it is the sole authorization for the terminal
// `recibido` transition. See `solicitud-closure-security` for the
// validation, throttle, and audit helpers that consume this value.
export interface CreateSolicitudResult {
  id: number;
  pinGestion: string;
  pinCierre: string;
}

type SolicitudInsert = typeof schema.solicitudes.$inferInsert;

export async function createSolicitud(
  input: CreateSolicitudInput,
): Promise<CreateSolicitudResult> {
  const db = getDb();
  // Both PINs are generated up front per attempt. They are independent
  // draws from the same `generatePin()` CSPRNG; treating them together
  // keeps the retry loop symmetrical and ensures every collision retry
  // re-rolls both values, never leaking a previously-attempted closure
  // credential into the next insert.
  const values: SolicitudInsert = {
    ...input,
    urgencia: input.urgencia ?? "moderado",
    estatus: "activo",
    pinGestion: generatePin(),
    pinCierre: generatePin(),
  };

  for (let attempt = 0; attempt < MAX_PIN_RETRIES; attempt++) {
    try {
      const result = await db.insert(schema.solicitudes).values(values);
      return {
        id: Number(result[0].insertId),
        pinGestion: values.pinGestion as string,
        pinCierre: values.pinCierre as string,
      };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // PIN collision: regenerate both PINs and retry on the next loop
      // iteration. The schema currently only enforces uniqueness on
      // `pinGestion`; `pinCierre` is still backfill-safe in the database
      // (the follow-up migration will promote it to NOT NULL + UNIQUE),
      // so only the gestion PIN collision is what actually reaches this
      // catch in production. Regenerating `pinCierre` here is defensive
      // and keeps the loop body single-shape across both columns.
      values.pinGestion = generatePin();
      values.pinCierre = generatePin();
    }
  }

  throw new PinCollisionError();
}
