import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };
type Db = MySql2Database<typeof fullSchema>;

// `buildPoolConfig` is exported as a pure helper so the test suite can drive
// the env -> mysql2 mapping without spinning up a real pool. Production
// code uses it indirectly via `getPool()`.
export function buildPoolConfig(source: {
  databaseUrl: string;
  pool: {
    connectionLimit: number;
    queueLimit: number;
    connectTimeoutMs: number;
    idleTimeoutMs: number;
  };
}) {
  return {
    uri: source.databaseUrl,
    connectionLimit: source.pool.connectionLimit,
    queueLimit: source.pool.queueLimit,
    connectTimeout: source.pool.connectTimeoutMs,
    idleTimeout: source.pool.idleTimeoutMs,
  };
}

let pool: mysql.Pool | null = null;
let dbInstance: Db | null = null;

export function getPool(): mysql.Pool {
  const existing = pool;
  if (existing) return existing;
  const created = mysql.createPool(buildPoolConfig(env));
  pool = created;
  return created;
}

export function getDb(): Db {
  // Pull through a local so the return type narrows to `Db` rather
  // than `Db | null`. TypeScript control-flow analysis cannot reason
  // about the singleton reassignment from inside the if-block.
  const existing = dbInstance;
  if (existing) return existing;
  const created = drizzle(getPool(), {
    mode: "planetscale",
    schema: fullSchema,
  });
  dbInstance = created;
  return created;
}

// `pingDb` is the boot-time health check. It always releases the
// connection back to the pool, even on failure, so a transient driver
// error cannot leak slots and wedge the readiness probe.
export async function pingDb(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

export async function closeDb(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  dbInstance = null;
  await current.end();
}

// Test-only escape hatch. Production code paths must never call this.
export function __resetForTests(): void {
  pool = null;
  dbInstance = null;
}
