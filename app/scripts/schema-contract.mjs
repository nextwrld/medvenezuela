#!/usr/bin/env node
// schema-contract.mjs
//
// Read-only MySQL schema comparison and guarded baseline registration for the
// MVP. Pure helpers are exported so the Vitest suite can drive them directly;
// the CLI logic is reserved for the script entry point at the bottom.
//
// Public API (pure, no I/O):
//   - DRIZZLE_MIGRATIONS_TABLE
//   - IGNORED_COLUMNS
//   - normalizeSchemaRows(rows)
//   - diffNormalizedSchemas(target, reference)
//   - summarizeMigrations(migrationsDir)
//   - assertEmptyJournal(rows)
//   - isMissingTableError(err)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

// `information_schema.COLUMNS.EXTRA` carries volatile AUTO_INCREMENT counters
// (e.g. "auto_increment=42") that drift between two equally-shaped databases
// whenever data has been inserted. We strip that column from any row we
// normalise so the diff stays focused on real schema shape.
export const IGNORED_COLUMNS = Object.freeze(["extra"]);

function canonicalRow(row) {
  // Preserve only columns that describe durable schema shape. We deliberately
  // drop `extra` and any future volatile columns callers may pass in.
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (IGNORED_COLUMNS.includes(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function rowKey(row) {
  return `${row.table ?? ""}.${row.column ?? ""}`;
}

export function normalizeSchemaRows(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("normalizeSchemaRows expects an array");
  }
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.table === DRIZZLE_MIGRATIONS_TABLE) continue;
    const clean = canonicalRow(raw);
    const key = rowKey(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  out.sort((a, b) => {
    const t = String(a.table).localeCompare(String(b.table));
    if (t !== 0) return t;
    return String(a.column).localeCompare(String(b.column));
  });
  return out;
}

export function diffNormalizedSchemas(target, reference) {
  const a = normalizeSchemaRows(target);
  const b = normalizeSchemaRows(reference);
  const aKeys = new Set(a.map(rowKey));
  const bKeys = new Set(b.map(rowKey));
  const findings = [];

  for (const row of a) {
    if (!bKeys.has(rowKey(row))) {
      findings.push({ kind: "missing-in-reference", target: rowKey(row) });
    }
  }
  for (const row of b) {
    if (!aKeys.has(rowKey(row))) {
      findings.push({ kind: "missing-in-target", reference: rowKey(row) });
    }
  }

  return { equal: findings.length === 0, findings };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function summarizeMigrations(migrationsDir) {
  const dir = resolve(migrationsDir);
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (!journal || !Array.isArray(journal.entries)) {
    throw new Error(`Invalid journal at ${journalPath}`);
  }
  const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx);
  return ordered.map((entry) => {
    const sqlPath = join(dir, `${entry.tag}.sql`);
    let sql;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch (err) {
      throw new Error(
        `Migration ${entry.tag} listed in journal but SQL file not found at ${sqlPath}: ${err.message}`
      );
    }
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      hash: sha256(sql),
      sql,
    };
  });
}

export function assertEmptyJournal(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("assertEmptyJournal expects an array");
  }
  if (rows.length > 0) {
    throw new Error(
      `Migration journal is not empty (${rows.length} entries). ` +
        `Baseline registration is only valid on a fresh database.`
    );
  }
}

// MySQL surfaces "Table 'db.__drizzle_migrations' doesn't exist" with errno
// 1146 (ER_NO_SUCH_TABLE). The baseline must tolerate this case so it can run
// against a fresh database that has no journal table yet — the table is
// created later in `runBaseline()`. Other errors (parse errors, connection
// failures, etc.) must keep propagating so the user sees the real cause.
export function isMissingTableError(err) {
  if (!err || typeof err !== "object") return false;
  return err.errno === 1146 || err.code === "ER_NO_SUCH_TABLE";
}

// ── CLI: live-schema verification + guarded baseline registration ────────────
//
// The script is invoked via `npm run db:verify` or `npm run db:baseline`.
// It deliberately has NO production code paths that depend on this CLI shape;
// everything testable lives in the pure helpers above.

const HELP = `Usage:
  node scripts/schema-contract.mjs verify
  node scripts/schema-contract.mjs baseline --confirm

Environment:
  DATABASE_URL                  Target MySQL connection string
  SCHEMA_REFERENCE_DATABASE_URL Reference (migrated) MySQL connection string
`;

async function loadMigrationsTable(connection) {
  try {
    const [rows] = await connection.query(
      "SELECT id, hash, created_at FROM ?? ORDER BY id ASC",
      [DRIZZLE_MIGRATIONS_TABLE]
    );
    return rows;
  } catch (err) {
    // A fresh database has no journal table yet. Treat that as an empty
    // journal so the baseline flow can register migrations; the table itself
    // is created by `runBaseline()` immediately after this read. Any other
    // error (parse, connection, permission) must bubble up.
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

async function fetchSchemaSnapshot(connection) {
  const [tables] = await connection.query(
    "SELECT TABLE_NAME AS `table` FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
  );
  const [columns] = await connection.query(
    "SELECT TABLE_NAME AS `table`, COLUMN_NAME AS `column`, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
  );
  const [indexes] = await connection.query(
    "SELECT TABLE_NAME AS `table`, INDEX_NAME AS `index`, COLUMN_NAME AS `column`, NON_UNIQUE AS nonUnique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()"
  );
  const [foreignKeys] = await connection.query(
    "SELECT TABLE_NAME AS `table`, COLUMN_NAME AS `column`, CONSTRAINT_NAME AS constraintName, REFERENCED_TABLE_NAME AS referencedTable, REFERENCED_COLUMN_NAME AS referencedColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"
  );
  return [
    ...columns.map((c) => ({ ...c, kind: "column" })),
    ...tables.map((t) => ({ table: t.table, column: "__table__", kind: "table" })),
    ...indexes.map((i) => ({
      table: i.table,
      column: `${i.index}::${i.column}::${i.nonUnique ? "idx" : "uniq"}`,
      kind: "index",
    })),
    ...foreignKeys.map((f) => ({
      table: f.table,
      column: `${f.constraintName}->${f.referencedTable}.${f.referencedColumn}`,
      kind: "fk",
    })),
  ];
}

function formatFindings(findings) {
  if (findings.length === 0) return "  (no diffs)";
  return findings.map((f) => `  - ${f.kind}: ${f.target ?? f.reference}`).join("\n");
}

function requireEnv() {
  const targetUrl = process.env.DATABASE_URL;
  const referenceUrl = process.env.SCHEMA_REFERENCE_DATABASE_URL;
  const missing = [];
  if (!targetUrl) missing.push("DATABASE_URL");
  if (!referenceUrl) missing.push("SCHEMA_REFERENCE_DATABASE_URL");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return { targetUrl, referenceUrl };
}

async function runVerify(mysql) {
  const { targetUrl, referenceUrl } = requireEnv();
  const targetConn = await mysql.createConnection(targetUrl);
  const referenceConn = await mysql.createConnection(referenceUrl);
  try {
    const target = await fetchSchemaSnapshot(targetConn);
    const reference = await fetchSchemaSnapshot(referenceConn);
    const result = diffNormalizedSchemas(target, reference);
    if (result.equal) {
      console.log("Schema contract: target matches reference (no diffs).");
      return 0;
    }
    console.error("Schema contract: target DOES NOT match reference.");
    console.error(`Findings (${result.findings.length}):`);
    console.error(formatFindings(result.findings));
    return 1;
  } finally {
    await targetConn.end().catch(() => undefined);
    await referenceConn.end().catch(() => undefined);
  }
}

async function runBaseline(mysql) {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to baseline without --confirm. Re-run with --confirm to register the baseline.");
    return 2;
  }
  const { targetUrl, referenceUrl } = requireEnv();
  const targetConn = await mysql.createConnection(targetUrl);
  const referenceConn = await mysql.createConnection(referenceUrl);
  try {
    const target = await fetchSchemaSnapshot(targetConn);
    const reference = await fetchSchemaSnapshot(referenceConn);
    const result = diffNormalizedSchemas(target, reference);
    if (!result.equal) {
      console.error("Schema contract: target DOES NOT match reference. Baseline refused.");
      console.error(formatFindings(result.findings));
      return 1;
    }
    const existing = await loadMigrationsTable(targetConn);
    assertEmptyJournal(existing);

    const entries = summarizeMigrations(resolve("db/migrations"));
    await targetConn.query(
      `CREATE TABLE IF NOT EXISTS \`${DRIZZLE_MIGRATIONS_TABLE}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hash varchar(255) NOT NULL,
        created_at bigint NOT NULL
      )`
    );
    for (const entry of entries) {
      await targetConn.query(
        `INSERT INTO \`${DRIZZLE_MIGRATIONS_TABLE}\` (hash, created_at) VALUES (?, ?)`,
        [entry.hash, entry.when]
      );
    }
    console.log(`Schema contract: registered ${entries.length} baseline migration(s).`);
    return 0;
  } finally {
    await targetConn.end().catch(() => undefined);
    await referenceConn.end().catch(() => undefined);
  }
}

async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return 0;
  }
  const { default: mysql } = await import("mysql2/promise");
  if (command === "verify") {
    return runVerify(mysql);
  }
  if (command === "baseline") {
    return runBaseline(mysql);
  }
  console.error(`Unknown command: ${command}`);
  console.log(HELP);
  return 2;
}

// Only run the CLI when this file is the entry point of the Node process.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
