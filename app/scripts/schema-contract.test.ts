import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  normalizeSchemaRows,
  diffNormalizedSchemas,
  summarizeMigrations,
  assertEmptyJournal,
  isMissingTableError,
  DRIZZLE_MIGRATIONS_TABLE,
  IGNORED_COLUMNS,
} from "./schema-contract.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Stable hash identical to the runtime helper. The function is part of the
// public surface because guards and tests must agree byte-for-byte.
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

describe("normalizeSchemaRows", () => {
  it("returns a stable sorted representation regardless of input order", () => {
    const rows = [
      { table: "b", column: "id" },
      { table: "a", column: "id" },
    ];
    const a = normalizeSchemaRows(rows);
    const b = normalizeSchemaRows([...rows].reverse());
    expect(a).toEqual(b);
    expect(a).toEqual([
      { table: "a", column: "id" },
      { table: "b", column: "id" },
    ]);
  });

  it("ignores the Drizzle migration journal and autoincrement counters", () => {
    const rows = [
      { table: DRIZZLE_MIGRATIONS_TABLE, column: "id" },
      { table: "solicitudes", column: "id", extra: "AUTO_INCREMENT=42" },
      { table: "solicitudes", column: "id", extra: "AUTO_INCREMENT=100" },
    ];
    const out = normalizeSchemaRows(rows);
    // Only the user table remains, and the extra column is dropped from
    // output because it carries a volatile autoincrement counter.
    expect(out).toEqual([{ table: "solicitudes", column: "id" }]);
    expect(IGNORED_COLUMNS).toContain("extra");
  });

  it("treats empty input as an empty normalized list (proves production code ran)", () => {
    const out = normalizeSchemaRows([]);
    expect(out).toEqual([]);
  });
});

describe("diffNormalizedSchemas", () => {
  it("returns equal=true and zero findings for identical inputs", () => {
    const rows = [
      { table: "users", column: "id" },
      { table: "users", column: "unionId" },
    ];
    const result = diffNormalizedSchemas(rows, rows);
    expect(result.equal).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("labels a column present in target but missing in reference as drift", () => {
    const target = [
      { table: "users", column: "id" },
      { table: "users", column: "newCol" },
    ];
    const reference = [{ table: "users", column: "id" }];
    const result = diffNormalizedSchemas(target, reference);
    expect(result.equal).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "missing-in-reference", target: "users.newCol" }),
    ]);
  });

  it("labels a column present in reference but missing in target as drift", () => {
    const target = [{ table: "users", column: "id" }];
    const reference = [
      { table: "users", column: "id" },
      { table: "users", column: "unionId" },
    ];
    const result = diffNormalizedSchemas(target, reference);
    expect(result.equal).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "missing-in-target", reference: "users.unionId" }),
    ]);
  });

  it("collects multiple drifts in a single pass (triangulation: multi-row diff)", () => {
    const target = [
      { table: "a", column: "id" },
      { table: "a", column: "extra" },
    ];
    const reference = [
      { table: "a", column: "id" },
      { table: "b", column: "id" },
    ];
    const result = diffNormalizedSchemas(target, reference);
    expect(result.equal).toBe(false);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.kind).sort()).toEqual([
      "missing-in-reference",
      "missing-in-target",
    ]);
  });
});

describe("summarizeMigrations", () => {
  let workdir;
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "schema-contract-"));
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("orders entries by journal idx, hashes SQL, and includes the journal timestamp", () => {
    const journal = {
      version: "7",
      dialect: "mysql",
      entries: [
        { idx: 1, version: "7", when: 1700000000000, tag: "0001_add_index", breakpoints: true },
        { idx: 0, version: "7", when: 1690000000000, tag: "0000_initial", breakpoints: true },
      ],
    };
    mkdirSync(join(workdir, "meta"), { recursive: true });
    writeFileSync(join(workdir, "meta/_journal.json"), JSON.stringify(journal));
    writeFileSync(join(workdir, "0000_initial.sql"), "CREATE TABLE x (id int);");
    writeFileSync(join(workdir, "0001_add_index.sql"), "CREATE INDEX i ON x (id);");

    const entries = summarizeMigrations(workdir);
    expect(entries.map((e) => e.idx)).toEqual([0, 1]);
    expect(entries[0].tag).toBe("0000_initial");
    expect(entries[0].hash).toBe(sha256("CREATE TABLE x (id int);"));
    expect(entries[0].when).toBe(1690000000000);
    expect(entries[1].tag).toBe("0001_add_index");
    expect(entries[1].hash).toBe(sha256("CREATE INDEX i ON x (id);"));
  });

  it("throws when the journal points to a missing SQL file (proves file resolution runs)", () => {
    const journal = {
      version: "7",
      dialect: "mysql",
      entries: [{ idx: 0, version: "7", when: 1, tag: "0000_missing", breakpoints: true }],
    };
    mkdirSync(join(workdir, "meta"), { recursive: true });
    writeFileSync(join(workdir, "meta/_journal.json"), JSON.stringify(journal));
    expect(() => summarizeMigrations(workdir)).toThrow(/0000_missing/);
  });
});

describe("assertEmptyJournal", () => {
  it("throws when at least one migration is registered (proves guard runs)", () => {
    expect(() => assertEmptyJournal([{ idx: 0, tag: "0000_initial" }])).toThrow(
      /journal is not empty/i
    );
  });

  it("passes silently when no migrations are registered (real guard hit)", () => {
    expect(() => assertEmptyJournal([])).not.toThrow();
  });
});

describe("isMissingTableError", () => {
  it("matches MySQL 'table does not exist' errors by errno (1146)", () => {
    // MySQL surfaces "Table '<db>.__drizzle_migrations' doesn't exist" with
    // errno 1146 (ER_NO_SUCH_TABLE). The baseline must swallow this so it can
    // run against a fresh database that has no journal yet.
    expect(isMissingTableError({ errno: 1146 })).toBe(true);
  });

  it("matches by error code string (ER_NO_SUCH_TABLE)", () => {
    // Some mysql2 driver builds expose the canonical code instead of errno.
    expect(isMissingTableError({ code: "ER_NO_SUCH_TABLE" })).toBe(true);
  });

  it("rejects unrelated MySQL errors so they keep surfacing", () => {
    // ER_PARSE_ERROR (1064) must NOT be swallowed — it means the SQL is wrong
    // and the user needs to see it.
    expect(isMissingTableError({ code: "ER_PARSE_ERROR", errno: 1064 })).toBe(false);
    expect(isMissingTableError({ errno: 1064 })).toBe(false);
  });

  it("rejects non-objects, null, and undefined so the type contract holds", () => {
    // The helper is called inside a catch block; defensive checks keep the
    // guard from accidentally masking everything.
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError("ER_NO_SUCH_TABLE")).toBe(false);
    expect(isMissingTableError(new Error("boom"))).toBe(false);
  });
});
