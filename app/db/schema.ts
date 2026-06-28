import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── OAuth Users (Kimi) ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Local Users (username/password) ───
export const localUsers = mysqlTable("local_users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

// ─── Solicitudes de Medicamentos ───
//
// `pinCierre` is declared nullable in schema because migration 0001 introduces
// it as a backfill-safe column. The release pipeline runs a server-side
// backfill that populates every existing row using the same `generatePin()`
// helper that creates new solicitudes, then a follow-up migration tightens
// the column to NOT NULL + UNIQUE. Keeping the schema in sync with the
// intermediate state prevents the application from inserting into a column
// the database has not yet promoted to required.
export const solicitudes = mysqlTable("solicitudes", {
  id: serial("id").primaryKey(),
  medicamento: varchar("medicamento", { length: 255 }).notNull(),
  principioActivo: varchar("principioActivo", { length: 255 }).notNull(),
  cantidad: varchar("cantidad", { length: 100 }).notNull(),
  dosis: varchar("dosis", { length: 100 }),
  hospital: varchar("hospital", { length: 255 }).notNull(),
  estado: varchar("estado", { length: 100 }).notNull(),
  ciudad: varchar("ciudad", { length: 100 }).notNull(),
  telefono: varchar("telefono", { length: 50 }).notNull(),
  nombreSolicitante: varchar("nombreSolicitante", { length: 255 }).notNull(),
  rolSolicitante: mysqlEnum("rolSolicitante", [
    "medico",
    "familiar",
    "personal_salud",
  ]).notNull(),
  inicialesPaciente: varchar("inicialesPaciente", { length: 50 }),
  urgencia: mysqlEnum("urgencia", ["critico", "moderado", "estable"])
    .default("moderado")
    .notNull(),
  estatus: mysqlEnum("estatus", ["activo", "en_proceso", "recibido"])
    .default("activo")
    .notNull(),
  pinGestion: varchar("pinGestion", { length: 8 }).notNull().unique("solicitudes_pin_gestion_unique"),
  // Closure credential. Generated alongside `pinGestion` on creation. The
  // migration introduces it nullable so existing rows can be backfilled in
  // a release step; a follow-up migration promotes it to NOT NULL + UNIQUE.
  pinCierre: varchar("pinCierre", { length: 8 }),
  // Optional free-text note captured at closure time. Stays null when the
  // closer does not provide one — closure without notes is still valid.
  notasCierre: text("notasCierre"),
  // Timestamp of the terminal `recibido` transition. Null while the
  // solicitud is still active or in progress.
  closedAt: timestamp("closedAt"),
  notas: text("notas"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Solicitud = typeof solicitudes.$inferSelect;
export type InsertSolicitud = typeof solicitudes.$inferInsert;
// Public DTO — the subset of Solicitud that is safe to expose in
// list / detail endpoints. Intentionally excludes pinGestion,
// pinCierre, notasCierre, and closedAt so no page or component
// can accidentally render a closure credential.
export type PublicSolicitud = Pick<
  Solicitud,
  | "id"
  | "medicamento"
  | "principioActivo"
  | "cantidad"
  | "dosis"
  | "hospital"
  | "estado"
  | "ciudad"
  | "telefono"
  | "nombreSolicitante"
  | "rolSolicitante"
  | "inicialesPaciente"
  | "urgencia"
  | "estatus"
  | "pinGestion"
  | "notas"
  | "createdAt"
  | "updatedAt"
>;

// ─── Solicitud Closure Audit ───
//
// Durable record of every admin recovery or closure override action. One row
// per override attempt that reached the database; failed validations (missing
// reason, insufficient role, etc.) are NOT recorded here. `actorName` is
// denormalized so the audit trail stays readable even if the admin user
// record is later renamed or removed. The `action` enum captures the
// semantics; the `reason` column stores the human-supplied explanation
// required by the override contract.
export const solicitudClosureAudit = mysqlTable("solicitudClosureAudit", {
  id: serial("id").primaryKey(),
  solicitudId: int("solicitudId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  actorName: varchar("actorName", { length: 255 }),
  action: mysqlEnum("action", ["admin_close"]).notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SolicitudClosureAudit = typeof solicitudClosureAudit.$inferSelect;
export type InsertSolicitudClosureAudit = typeof solicitudClosureAudit.$inferInsert;

// ─── Solicitud Closure Attempts (rate limiting) ───
//
// Rate-limit bookkeeping for failed closure PIN submissions. One row per
// (solicitudId, identifierHash) pair; the row is reused as long as the
// attempt window is still active and reset when it expires. `identifierHash`
// is a SHA-256 of the client-supplied identifier (typically the forwarded
// IP address) so we never store raw identifiers in the database.
export const solicitudClosureAttempts = mysqlTable(
  "solicitudClosureAttempts",
  {
    id: serial("id").primaryKey(),
    solicitudId: int("solicitudId").notNull(),
    identifierHash: varchar("identifierHash", { length: 64 }).notNull(),
    windowStartsAt: timestamp("windowStartsAt").defaultNow().notNull(),
    attemptCount: int("attemptCount").notNull().default(0),
  },
  (table) => ({
    // Composite uniqueness keeps the row count bounded — at most one
    // active window per (solicitud, identifier) pair.
    pairUnique: uniqueIndex("solicitud_closure_attempts_unique").on(
      table.solicitudId,
      table.identifierHash,
    ),
    // Lookup by solicitud so the cleanup / recheck paths can scan per
    // solicitud without a full table scan.
    solicitudIdx: index("solicitud_closure_attempts_solicitud_idx").on(
      table.solicitudId,
    ),
  }),
);

export type SolicitudClosureAttempt = typeof solicitudClosureAttempts.$inferSelect;
export type InsertSolicitudClosureAttempt = typeof solicitudClosureAttempts.$inferInsert;
