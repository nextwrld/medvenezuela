import { describe, it, expect, vi, beforeEach } from "vitest";

const { jwtSignMock, jwtVerifyMock, bcryptHashMock, bcryptCompareMock, getDbMock } =
  vi.hoisted(() => {
    const jwtSignMock = vi.fn();
    const jwtVerifyMock = vi.fn();
    const bcryptHashMock = vi.fn();
    const bcryptCompareMock = vi.fn();
    const getDbMock = vi.fn();
    jwtSignMock.mockReturnValue("signed-token");
    jwtVerifyMock.mockReturnValue({ id: 1, username: "u", role: "user" });
    bcryptHashMock.mockResolvedValue("hashed");
    bcryptCompareMock.mockResolvedValue(true);
    return {
      jwtSignMock,
      jwtVerifyMock,
      bcryptHashMock,
      bcryptCompareMock,
      getDbMock,
    };
  });

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: jwtSignMock,
    verify: jwtVerifyMock,
  },
  sign: jwtSignMock,
  verify: jwtVerifyMock,
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: bcryptHashMock,
    compare: bcryptCompareMock,
  },
  hash: bcryptHashMock,
  compare: bcryptCompareMock,
}));

const { selectChain, insertChain } = vi.hoisted(() => {
  function makeSelectChain(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    return { select, from, where, limit };
  }
  function makeInsertChain(insertId: number) {
    const values = vi.fn().mockResolvedValue([{ insertId }]);
    const insert = vi.fn().mockReturnValue({ values });
    return { insert, values };
  }
  return { selectChain: makeSelectChain, insertChain: makeInsertChain };
});

vi.mock("./queries/connection", () => ({
  getDb: getDbMock,
}));

import { env } from "./lib/env";
import { appRouter } from "./router";
import { createContext } from "./context";

async function callLogin(username: string, password: string) {
  const ctx = await createContext({
    req: new Request("http://localhost/api/trpc/localAuth.login"),
    resHeaders: new Headers(),
    info: {} as never,
  });
  const caller = appRouter.createCaller(ctx);
  return caller.localAuth.login({ username, password });
}

describe("local-auth-router JWT secret contract", () => {
  let userRows: ReturnType<typeof selectChain>;

  beforeEach(() => {
    jwtSignMock.mockClear();
    userRows = selectChain([
      {
        id: 1,
        username: "alice",
        passwordHash: "hashed",
        displayName: "Alice",
        role: "user",
      },
    ]);
    getDbMock.mockReturnValue({ ...userRows, ...insertChain(1) });
  });

  it("signs login tokens with env.appSecret, not a hardcoded fallback", async () => {
    await callLogin("alice", "pw");

    expect(jwtSignMock).toHaveBeenCalledTimes(1);
    const secret = jwtSignMock.mock.calls[0]?.[1];
    expect(secret).toBe(env.appSecret);
    // The historic fallback was the literal string "medvene-secret-key-2026"
    // (or any non-empty string different from env.appSecret). Either of
    // those regressions is what this assertion catches.
    expect(secret).not.toBe("medvene-secret-key-2026");
  });

  it("does not contain the legacy fallback string in the source file", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(import.meta.dirname, "local-auth-router.ts");
    const source = fs.readFileSync(file, "utf-8");
    expect(source).not.toMatch(/medvene-secret-key-2026/);
    // `env.appSecret || "..."` would silently mask a missing secret; the
    // router must trust env validation to have populated it.
    expect(source).not.toMatch(/env\.appSecret\s*\|\|/);
  });
});
