// Integration test: schema contract (drift + baseline).
//
// STRUCTURAL / STUB-LEVEL test. The spec scenarios it covers are:
//
//   database-lifecycle / Migration reproducibility
//     - Divergent database is detected (proven by the diff helper
//       surfacing "missing-in-target" / "missing-in-reference"
//       findings when the inputs diverge, and "no diffs" when they
//       match — even when fed from in-memory fixtures).
//
// The CLI entry points (`db:verify`, `db:baseline`) require a real
// MySQL. The pure helpers they delegate to (`diffNormalizedSchemas`,
// `assertEmptyJournal`, `isMissingTableError`, `summarizeMigrations`)
// do not; the assertions below prove the contract that the CLI relies
// on stays correct.

import { describe, it, expect } from "vitest";
import {
  diffNormalizedSchemas,
  normalizeSchemaRows,
  assertEmptyJournal,
  isMissingTableError,
  summarizeMigrations,
  DRIZZLE_MIGRATIONS_TABLE,
} from "../../scripts/schema-contract.mjs";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("integration: schema contract (structural)", () => {
  it("detects drift on a column that exists only in the target", () => {
    const target = [
      { table: "users", column: "id" },
      { table: "users", column: "phone" },
    ];
    const reference = [{ table: "users", column: "id" }];
    const result = diffNormalizedSchemas(target, reference);
    expect(result.equal).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "missing-in-reference", target: "users.phone" }),
    ]);
  });

  it("detects drift on a column that exists only in the reference", () => {
    const target = [{ table: "users", column: "id" }];
    const reference = [
      { table: "users", column: "id" },
      { table: "users", column: "email" },
    ];
    const result = diffNormalizedSchemas(target, reference);
    expect(result.equal).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "missing-in-target", reference: "users.email" }),
    ]);
  });

  it("ignores the migration journal table when comparing schemas", () => {
    const target = [
      { table: "users", column: "id" },
      { table: DRIZZLE_MIGRATIONS_TABLE, column: "id" },
      { table: DRIZZLE_MIGRATIONS_TABLE, column: "hash" },
    ];
    const reference = [{ table: "users", column: "id" }];
    const result = diffNormalizedSchemas(target, reference);
    expect(result.equal).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("normalizes volatile autoincrement counters so the diff stays focused on shape", () => {
    const rows = [
      { table: "solicitudes", column: "id", extra: "auto_increment=42" },
      { table: "solicitudes", column: "id", extra: "auto_increment=100" },
    ];
    const out = normalizeSchemaRows(rows);
    expect(out).toEqual([{ table: "solicitudes", column: "id" }]);
  });

  it("refuses to baseline a non-empty journal (would corrupt migration history)", () => {
    expect(() => assertEmptyJournal([{ idx: 0, tag: "0000_initial" }])).toThrow(
      /journal is not empty/i,
    );
  });

  it("accepts a journal that is already empty (real guard hit)", () => {
    expect(() => assertEmptyJournal([])).not.toThrow();
  });

  it("treats MySQL ER_NO_SUCH_TABLE on the journal as 'journal is empty' for a fresh DB", () => {
    expect(isMissingTableError({ errno: 1146 })).toBe(true);
    expect(isMissingTableError({ code: "ER_NO_SUCH_TABLE" })).toBe(true);
    expect(isMissingTableError({ errno: 1064, code: "ER_PARSE_ERROR" })).toBe(false);
  });

  it("reads the committed migration history and produces a SHA-256 per file", () => {
    const workdir = mkdtempSync(join(tmpdir(), "integration-schema-"));
    try {
      const journal = {
        version: "7",
        dialect: "mysql",
        entries: [
          { idx: 0, version: "7", when: 1, tag: "0000_initial", breakpoints: true },
        ],
      };
      mkdirSync(join(workdir, "meta"), { recursive: true });
      writeFileSync(join(workdir, "meta/_journal.json"), JSON.stringify(journal));
      writeFileSync(join(workdir, "0000_initial.sql"), "CREATE TABLE x (id int);");

      const entries = summarizeMigrations(workdir);
      expect(entries).toHaveLength(1);
      expect(entries[0].tag).toBe("0000_initial");
      expect(entries[0].hash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(workdir, { recursive: true, force: true });
    }
  });
});
