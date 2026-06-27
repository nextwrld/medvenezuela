import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Drizzle Kit's MySQL migrator uses a fixed table name to record applied
// migrations. Centralising the name here keeps the schema contract script and
// the migration runner in agreement on what counts as "journal state".
export const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
  // Pin the journal table name so the schema-contract script reads from the
  // same table Drizzle Kit writes to. Supported by Drizzle Kit MySQL: the
  // `migrations.table` field overrides the default `__drizzle_migrations`
  // table name used by `drizzle-kit migrate` to record applied migrations.
  migrations: {
    table: DRIZZLE_MIGRATIONS_TABLE,
  },
});
