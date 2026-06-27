import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
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
  notas: text("notas"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Solicitud = typeof solicitudes.$inferSelect;
export type InsertSolicitud = typeof solicitudes.$inferInsert;
