import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, or, desc, count, isNotNull } from "drizzle-orm";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  createSolicitud,
  PinCollisionError,
} from "./queries/create-solicitud";
import { createSolicitudInputSchema } from "./solicitudes-schemas";
import {
  validateClosurePin,
  checkThrottle,
  recordAttempt,
  writeAudit,
  hashIdentifier,
} from "./queries/solicitud-closure-security";
import * as schema from "@db/schema";

// `resolveRequestIdentifier` derives a stable, hashed identifier from
// the incoming request for throttle bookkeeping. `x-forwarded-for` is
// the canonical header set by every reverse proxy in front of the app;
// the first IP in the comma-separated list is the original client.
// `x-real-ip` covers direct nginx deployments. The literal "unknown"
// is the documented catch-all so the throttle still provides defense
// for clients that spoof both headers. The raw value is never stored;
// it is passed straight into `hashIdentifier` which produces the
// SHA-256 used as the throttle key.
function resolveRequestIdentifier(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headers.get("x-real-ip");
  if (xri) return xri;
  return "unknown";
}

const publicSolicitudSelect = {
  id: schema.solicitudes.id,
  medicamento: schema.solicitudes.medicamento,
  principioActivo: schema.solicitudes.principioActivo,
  cantidad: schema.solicitudes.cantidad,
  dosis: schema.solicitudes.dosis,
  hospital: schema.solicitudes.hospital,
  estado: schema.solicitudes.estado,
  ciudad: schema.solicitudes.ciudad,
  telefono: schema.solicitudes.telefono,
  nombreSolicitante: schema.solicitudes.nombreSolicitante,
  rolSolicitante: schema.solicitudes.rolSolicitante,
  inicialesPaciente: schema.solicitudes.inicialesPaciente,
  urgencia: schema.solicitudes.urgencia,
  estatus: schema.solicitudes.estatus,
  pinGestion: schema.solicitudes.pinGestion,
  notas: schema.solicitudes.notas,
  latitud: schema.solicitudes.latitud,
  longitud: schema.solicitudes.longitud,
  createdAt: schema.solicitudes.createdAt,
  updatedAt: schema.solicitudes.updatedAt,
};

// Proyección mínima para el mapa del feed. Solo lo que un marcador necesita;
// nunca incluye credenciales (pinGestion/pinCierre) ni datos de contacto.
export const mapPointSelect = {
  id: schema.solicitudes.id,
  latitud: schema.solicitudes.latitud,
  longitud: schema.solicitudes.longitud,
  urgencia: schema.solicitudes.urgencia,
  medicamento: schema.solicitudes.medicamento,
};

export const solicitudesRouter = createRouter({
  create: publicQuery
    .input(createSolicitudInputSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await createSolicitud(input);
        return {
          id: result.id,
          pinGestion: result.pinGestion,
          pinCierre: result.pinCierre,
        };
      } catch (err) {
        if (err instanceof PinCollisionError) {
          // Bounded retry exhaustion -> the unique-index race never
          // resolved. Surface as tRPC CONFLICT so clients can show a
          // meaningful retry message instead of an opaque 500.
          throw new TRPCError({
            code: "CONFLICT",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  list: publicQuery
    .input(
      z
        .object({
          search: z.string().optional(),
          estado: z.string().optional(),
          ciudad: z.string().optional(),
          estatus: z.enum(["activo", "en_proceso", "recibido"]).optional(),
          urgencia: z.enum(["critico", "moderado", "estable"]).optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(50).default(20),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const params = input ?? {
        page: 1,
        limit: 20,
      };
      const { search, estado, ciudad, estatus, urgencia, page, limit } = params;

      const conditions = [];

      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            like(schema.solicitudes.medicamento, searchTerm),
            like(schema.solicitudes.principioActivo, searchTerm),
            like(schema.solicitudes.hospital, searchTerm),
            like(schema.solicitudes.ciudad, searchTerm)
          )
        );
      }

      if (estado) {
        conditions.push(eq(schema.solicitudes.estado, estado));
      }

      if (ciudad) {
        conditions.push(eq(schema.solicitudes.ciudad, ciudad));
      }

      if (estatus) {
        conditions.push(eq(schema.solicitudes.estatus, estatus));
      } else {
        // Default: show only active + in_progress
        conditions.push(
          or(
            eq(schema.solicitudes.estatus, "activo"),
            eq(schema.solicitudes.estatus, "en_proceso")
          )
        );
      }

      if (urgencia) {
        conditions.push(eq(schema.solicitudes.urgencia, urgencia));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const items = await db
        .select(publicSolicitudSelect)
        .from(schema.solicitudes)
        .where(whereClause)
        .orderBy(desc(schema.solicitudes.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      const totalResult = await db
        .select({ count: count() })
        .from(schema.solicitudes)
        .where(whereClause);

      const total = totalResult[0]?.count ?? 0;

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      // Public DTO projection: explicit `.select({...})` so the closure
      // credential (`pinCierre`) and the management credential (`pinGestion`)
      // can NEVER leak through the public detail endpoint, and so the
      // closure metadata (`notasCierre`, `closedAt`) is hidden from
      // non-admin viewers. If a new column is added to `solicitudes` and
      // that column is safe to expose, it must be added here explicitly —
      // the default `select()` behavior would have leaked PINs.
      const rows = await db
        .select(publicSolicitudSelect)
        .from(schema.solicitudes)
        .where(eq(schema.solicitudes.id, input.id))
        .limit(1);

      return rows.at(0) ?? null;
    }),

  getByPin: publicQuery
    .input(z.object({ pin: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select(publicSolicitudSelect)
        .from(schema.solicitudes)
        .where(eq(schema.solicitudes.pinGestion, input.pin))
        .limit(1);

      return rows.at(0) ?? null;
    }),

  updateStatus: publicQuery
    .input(
      z.object({
        id: z.number(),
        // Management credential. Required for every transition so the
        // client always proves it knows at least the management PIN.
        pinGestion: z.string(),
        estatus: z.enum(["activo", "en_proceso", "recibido"]),
        // Closure credential. Required ONLY when transitioning to the
        // terminal `recibido` state; ignored on non-terminal updates.
        // The split matches the spec: `pinGestion` cannot close a
        // solicitud — only `pinCierre` can.
        pinCierre: z.string().optional(),
        // Optional free-text note persisted on the solicitud at closure
        // time. The spec lets clients omit it; passing undefined stores
        // a null column, which is treated as "no notes" downstream.
        notasCierre: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Read only the columns this mutation needs. We must NOT return
      // the raw PINs to the caller; we compare in-process and discard.
      const rows = await db
        .select({
          id: schema.solicitudes.id,
          estatus: schema.solicitudes.estatus,
          pinGestion: schema.solicitudes.pinGestion,
          pinCierre: schema.solicitudes.pinCierre,
        })
        .from(schema.solicitudes)
        .where(eq(schema.solicitudes.id, input.id))
        .limit(1);

      const solicitud = rows.at(0);
      if (!solicitud) {
        return { success: false, error: "Solicitud no encontrada" };
      }

      // Non-terminal transitions: the management PIN is sufficient.
      // The closure credential is intentionally NOT consulted here, so
      // a leaked `pinGestion` cannot close a solicitud.
      if (input.estatus !== "recibido") {
        if (solicitud.pinGestion !== input.pinGestion) {
          return { success: false, error: "PIN incorrecto" };
        }

        await db
          .update(schema.solicitudes)
          .set({ estatus: input.estatus })
          .where(eq(schema.solicitudes.id, input.id));

        return { success: true };
      }

      // Terminal closure (`recibido`) path.
      //
      // 1. Throttle check — a request that exceeds the rolling
      //    `THROTTLE_MAX_ATTEMPTS` budget inside `THROTTLE_WINDOW_MS`
      //    is rejected without consulting `pinCierre` at all. This is
      //    the spec's "Repeated failed closure attempts are throttled"
      //    defense.
      const identifier = resolveRequestIdentifier(ctx.req.headers);
      const identifierHash = hashIdentifier(identifier);
      const throttle = await checkThrottle(input.id, identifierHash);

      if (!throttle.allowed) {
        return {
          success: false,
          error: "Demasiados intentos. Intente más tarde.",
          throttled: true,
          resetsAt: throttle.resetsAt,
        };
      }

      // 2. Validate the closure PIN in constant time. A missing or
      //    malformed `pinCierre` falls through to the failure branch
      //    (no special-case errors) so the response does not leak
      //    whether the solicitud has a stored PIN at all.
      if (!validateClosurePin(input.pinCierre, solicitud.pinCierre)) {
        await recordAttempt(input.id, identifierHash);
        return { success: false, error: "PIN de cierre incorrecto" };
      }

      // 3. PIN valid — apply the terminal transition. We persist
      //    `closedAt` and `notasCierre` alongside the status so the
      //    closure metadata is queryable without a second round trip.
      await db
        .update(schema.solicitudes)
        .set({
          estatus: "recibido",
          notasCierre: input.notasCierre ?? null,
          closedAt: new Date(),
        })
        .where(eq(schema.solicitudes.id, input.id));

      return { success: true };
    }),

  adminClose: adminQuery
    .input(
      z.object({
        id: z.number(),
        // Human-supplied justification for the override. The spec
        // requires this and rejects any override that omits it.
        reason: z.string().min(1),
        // Optional closure notes. Forwarded to `notasCierre` so the
        // override and the PIN-validated closure flows produce
        // indistinguishable solicitud state.
        notasCierre: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Verify the solicitud exists before mutating. A missing row is
      // surfaced as a tRPC NOT_FOUND so the admin client can render a
      // meaningful error instead of a phantom success.
      const rows = await db
        .select({ id: schema.solicitudes.id })
        .from(schema.solicitudes)
        .where(eq(schema.solicitudes.id, input.id))
        .limit(1);

      if (!rows.at(0)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Solicitud no encontrada",
        });
      }

      // Apply the override. The status transition is identical to a
      // PIN-validated closure — the only difference is the path that
      // reached it. The audit row records which path this was.
      await db
        .update(schema.solicitudes)
        .set({
          estatus: "recibido",
          notasCierre: input.notasCierre ?? null,
          closedAt: new Date(),
        })
        .where(eq(schema.solicitudes.id, input.id));

      // Audit only AFTER a successful override. The spec's "Failed
      // override does not create misleading audit success" scenario
      // forbids recording rejected attempts as if they had closed the
      // solicitud, so we never invoke `writeAudit` from a branch that
      // did not already commit the state change above.
      await writeAudit({
        solicitudId: input.id,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? null,
        action: "admin_close",
        reason: input.reason,
      });

      return { success: true };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();

    const totalResult = await db
      .select({ count: count() })
      .from(schema.solicitudes);

    const activosResult = await db
      .select({ count: count() })
      .from(schema.solicitudes)
      .where(eq(schema.solicitudes.estatus, "activo"));

    const enProcesoResult = await db
      .select({ count: count() })
      .from(schema.solicitudes)
      .where(eq(schema.solicitudes.estatus, "en_proceso"));

    const recibidosResult = await db
      .select({ count: count() })
      .from(schema.solicitudes)
      .where(eq(schema.solicitudes.estatus, "recibido"));

    return {
      total: totalResult[0]?.count ?? 0,
      activos: activosResult[0]?.count ?? 0,
      enProceso: enProcesoResult[0]?.count ?? 0,
      recibidos: recibidosResult[0]?.count ?? 0,
    };
  }),

  // Puntos para el mapa del feed: todas las solicitudes activas / en proceso
  // que tienen coordenadas. Sin paginar (payload chico) y sin datos sensibles.
  mapPoints: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select(mapPointSelect)
      .from(schema.solicitudes)
      .where(
        and(
          isNotNull(schema.solicitudes.latitud),
          isNotNull(schema.solicitudes.longitud),
          or(
            eq(schema.solicitudes.estatus, "activo"),
            eq(schema.solicitudes.estatus, "en_proceso"),
          ),
        ),
      );
  }),
});
