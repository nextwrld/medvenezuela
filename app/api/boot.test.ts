import { describe, it, expect, vi, beforeEach } from "vitest";

const { parseEnvMock, pingDbMock, getDbMock, envMock, honoServeMock } =
  vi.hoisted(() => {
    const parseEnvMock = vi.fn();
    const pingDbMock = vi.fn();
    const getDbMock = vi.fn();
    // Provide the full shape the import chain (env -> kimi/auth ->
    // context -> router) reads at module load. Tests override only
    // `isProduction` to switch the boot branch.
    const envMock: any = {
      isProduction: false,
      port: 3000,
      appId: "test-app",
      appSecret: "test-secret",
      databaseUrl: "mysql://test:test@localhost:3306/test",
      kimiAuthUrl: "https://auth.example.com",
      kimiOpenUrl: "https://open.example.com",
      ownerUnionId: "",
      pool: {
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeoutMs: 10_000,
        idleTimeoutMs: 60_000,
      },
    };
    const honoServeMock = vi.fn();
    return { parseEnvMock, pingDbMock, getDbMock, envMock, honoServeMock };
  });

// The boot module has top-level side effects (the production-only
// `serve()` call runs at import time in production). To test it, we
// mock every dependency it touches so the module never tries to bind
// a real port or open a real pool.
vi.mock("./lib/env", () => ({
  parseEnv: parseEnvMock,
  env: envMock,
}));

vi.mock("./queries/connection", () => ({
  pingDb: pingDbMock,
  getDb: getDbMock,
}));

vi.mock("@hono/node-server", () => ({
  serve: honoServeMock,
}));

vi.mock("./lib/vite", () => ({
  serveStaticFiles: vi.fn(),
}));

import { performBootChecks } from "./boot";

beforeEach(() => {
  parseEnvMock.mockReset();
  pingDbMock.mockReset();
  honoServeMock.mockReset();
  envMock.isProduction = false;
  envMock.port = 3000;
  parseEnvMock.mockImplementation(() => envMock);
  pingDbMock.mockResolvedValue(undefined);
});

describe("performBootChecks", () => {
  it("runs env validation in production", async () => {
    envMock.isProduction = true;
    await performBootChecks();
    expect(parseEnvMock).toHaveBeenCalledTimes(1);
  });

  it("pings the database pool in production", async () => {
    envMock.isProduction = true;
    await performBootChecks();
    expect(pingDbMock).toHaveBeenCalledTimes(1);
  });

  it("skips env validation in non-production so dev iteration keeps working", async () => {
    envMock.isProduction = false;
    await performBootChecks();
    expect(parseEnvMock).not.toHaveBeenCalled();
  });

  it("still pings the database in non-production so devs catch misconfig early", async () => {
    envMock.isProduction = false;
    await performBootChecks();
    expect(pingDbMock).toHaveBeenCalledTimes(1);
  });

  it("rejects with the env error when parseEnv fails in production", async () => {
    envMock.isProduction = true;
    const err = new Error("Invalid environment configuration: APP_ID: too short");
    parseEnvMock.mockImplementationOnce(() => {
      throw err;
    });
    await expect(performBootChecks()).rejects.toBe(err);
    // We must NOT proceed to ping if env validation already failed;
    // otherwise we'd be probing a misconfigured database.
    expect(pingDbMock).not.toHaveBeenCalled();
  });

  it("rejects with the ping error when the pool is unreachable in production", async () => {
    envMock.isProduction = true;
    const err = new Error("ECONNREFUSED");
    pingDbMock.mockRejectedValueOnce(err);
    await expect(performBootChecks()).rejects.toBe(err);
  });

  it("rejects with the ping error when the pool is unreachable in development too", async () => {
    envMock.isProduction = false;
    const err = new Error("ECONNREFUSED");
    pingDbMock.mockRejectedValueOnce(err);
    await expect(performBootChecks()).rejects.toBe(err);
  });
});

// These tests exercise the TOP-LEVEL production branch of `boot.ts`,
// not the standalone `performBootChecks` function. The production
// `if (env.isProduction) { ... }` block runs at module load time, so we
// must drop the module from the cache and re-import the file with
// `env.isProduction = true` to reproduce the real startup path. The
// earlier `performBootChecks` tests prove the function works in
// isolation; these tests prove the function is actually wired into the
// production startup.
describe("production startup wiring (top-level serve gate)", () => {
  it("refuses to start when env validation throws in production", async () => {
    vi.resetModules();
    envMock.isProduction = true;
    parseEnvMock.mockImplementationOnce(() => {
      throw new Error("Invalid environment configuration: APP_ID: too short");
    });
    honoServeMock.mockClear();
    pingDbMock.mockClear();

    await expect(import("./boot")).rejects.toThrow(
      "Invalid environment configuration",
    );
    expect(honoServeMock).not.toHaveBeenCalled();
    // We must NOT probe the DB if env validation already failed —
    // probing a misconfigured database would just hide the real cause.
    expect(pingDbMock).not.toHaveBeenCalled();
  });

  it("refuses to start when the pool ping fails in production", async () => {
    vi.resetModules();
    envMock.isProduction = true;
    parseEnvMock.mockImplementation(() => envMock);
    pingDbMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    honoServeMock.mockClear();

    await expect(import("./boot")).rejects.toThrow("ECONNREFUSED");
    expect(honoServeMock).not.toHaveBeenCalled();
  });

  it("starts serving only after env validation AND pool ping both pass", async () => {
    vi.resetModules();
    envMock.isProduction = true;
    parseEnvMock.mockImplementation(() => envMock);
    pingDbMock.mockResolvedValue(undefined);
    honoServeMock.mockClear();

    await expect(import("./boot")).resolves.toBeDefined();
    expect(parseEnvMock).toHaveBeenCalledTimes(1);
    expect(pingDbMock).toHaveBeenCalledTimes(1);
    expect(honoServeMock).toHaveBeenCalledTimes(1);
  });
});
