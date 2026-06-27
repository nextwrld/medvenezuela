import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, or, desc, count } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  createSolicitud,
  PinCollisionError,
} from "./queries/create-solicitud";
import * as schema from "@db/schema";

export const solicitudesRouter = createRouter({
  create: publicQuery
    .input(
      z.object({
        medicamento: z.string().min(1).max(255),
        principioActivo: z.string().min(1).max(255),
        cantidad: z.string().min(1).max(100),
        dosis: z.string().max(100).optional(),
        hospital: z.string().min(1).max(255),
        estado: z.string().min(1).max(100),
        ciudad: z.string().min(1).max(100),
        telefono: z.string().min(1).max(50),
        nombreSolicitante: z.string().min(1).max(255),
        rolSolicitante: z.enum(["medico", "familiar", "personal_salud"]),
        inicialesPaciente: z.string().max(50).optional(),
        urgencia: z.enum(["critico", "moderado", "estable"]).optional(),
        notas: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await createSolicitud(input);
        return {
          id: result.id,
          pinGestion: result.pinGestion,
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
        .select()
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
      const rows = await db
        .select()
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
        .select()
        .from(schema.solicitudes)
        .where(eq(schema.solicitudes.pinGestion, input.pin))
        .limit(1);

      return rows.at(0) ?? null;
    }),

  updateStatus: publicQuery
    .input(
      z.object({
        id: z.number(),
        pin: z.string(),
        estatus: z.enum(["activo", "en_proceso", "recibido"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      // Verify PIN matches
      const rows = await db
        .select()
        .from(schema.solicitudes)
        .where(eq(schema.solicitudes.id, input.id))
        .limit(1);

      const solicitud = rows.at(0);
      if (!solicitud) {
        return { success: false, error: "Solicitud no encontrada" };
      }

      if (solicitud.pinGestion !== input.pin) {
        return { success: false, error: "PIN incorrecto" };
      }

      await db
        .update(schema.solicitudes)
        .set({ estatus: input.estatus })
        .where(eq(schema.solicitudes.id, input.id));

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
});
