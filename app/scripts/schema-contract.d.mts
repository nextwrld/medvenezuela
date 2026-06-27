// Type declarations for `scripts/schema-contract.mjs`.
//
// The script is a CLI entry point that lives in `.mjs` so it can be
// invoked directly with `node` without a build step. The pure helpers
// it exports are reused by the test suite (unit and integration), so
// the types live here as a sibling declaration file. Keeping the
// declarations close to the implementation prevents drift between
// the two files.

export const DRIZZLE_MIGRATIONS_TABLE: string;

export const IGNORED_COLUMNS: readonly string[];

export interface NormalizedSchemaRow {
  table: string;
  column: string;
  [key: string]: unknown;
}

export function normalizeSchemaRows(rows: unknown[]): NormalizedSchemaRow[];

export interface SchemaDiffFinding {
  kind: "missing-in-reference" | "missing-in-target";
  target?: string;
  reference?: string;
}

export interface SchemaDiffResult {
  equal: boolean;
  findings: SchemaDiffFinding[];
}

export function diffNormalizedSchemas(
  target: unknown[],
  reference: unknown[],
): SchemaDiffResult;

export interface MigrationSummaryEntry {
  idx: number;
  tag: string;
  when: number;
  hash: string;
  sql: string;
}

export function summarizeMigrations(migrationsDir: string): MigrationSummaryEntry[];

export function assertEmptyJournal(rows: unknown[]): void;

export function isMissingTableError(err: unknown): boolean;
