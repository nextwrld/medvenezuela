import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock factories are hoisted to the top of the file, so the variables
// they reference must also be hoisted via vi.hoisted. The mocks below
// give us full control over createPool / getConnection / ping / release /
// end so we can assert on the call sequence without touching a real DB.
const {
  createPoolMock,
  endMock,
  getConnectionMock,
  pingMock,
  releaseMock,
  fakeConnection,
  fakePool,
} = vi.hoisted(() => {
  const createPoolMock = vi.fn();
  const endMock = vi.fn();
  const getConnectionMock = vi.fn();
  const pingMock = vi.fn();
  const releaseMock = vi.fn();
  const fakeConnection = { ping: pingMock, release: releaseMock };
  const fakePool = { getConnection: getConnectionMock, end: endMock };
  createPoolMock.mockReturnValue(fakePool);
  getConnectionMock.mockResolvedValue(fakeConnection);
  pingMock.mockResolvedValue(undefined);
  releaseMock.mockReturnValue(undefined);
  endMock.mockResolvedValue(undefined);
  return {
    createPoolMock,
    endMock,
    getConnectionMock,
    pingMock,
    releaseMock,
    fakeConnection,
    fakePool,
  };
});

vi.mock("mysql2/promise", () => ({
  default: { createPool: createPoolMock },
  createPool: createPoolMock,
}));

vi.mock("../lib/env", () => ({
  env: {
    databaseUrl: "mysql://user:pass@localhost:3306/db",
    pool: {
      connectionLimit: 10,
      queueLimit: 50,
      connectTimeoutMs: 5000,
      idleTimeoutMs: 30000,
    },
  },
}));

import {
  buildPoolConfig,
  getPool,
  pingDb,
  closeDb,
  __resetForTests,
} from "./connection";

beforeEach(() => {
  __resetForTests();
  createPoolMock.mockClear();
  endMock.mockClear();
  getConnectionMock.mockClear();
  pingMock.mockClear();
  releaseMock.mockClear();
  createPoolMock.mockReturnValue(fakePool);
  getConnectionMock.mockResolvedValue(fakeConnection);
  pingMock.mockResolvedValue(undefined);
  releaseMock.mockReturnValue(undefined);
  endMock.mockResolvedValue(undefined);
});

describe("buildPoolConfig", () => {
  it("maps ParsedEnv pool fields onto mysql2 PoolOptions", () => {
    const cfg = buildPoolConfig({
      databaseUrl: "mysql://u:p@h:3306/d",
      pool: {
        connectionLimit: 7,
        queueLimit: 11,
        connectTimeoutMs: 2500,
        idleTimeoutMs: 45000,
      },
    });
    expect(cfg).toEqual({
      uri: "mysql://u:p@h:3306/d",
      connectionLimit: 7,
      queueLimit: 11,
      connectTimeout: 2500,
      idleTimeout: 45000,
    });
  });
});

describe("getPool", () => {
  it("creates the pool exactly once with the bounded config", () => {
    const a = getPool();
    const b = getPool();
    expect(a).toBe(b);
    expect(createPoolMock).toHaveBeenCalledTimes(1);
    expect(createPoolMock).toHaveBeenCalledWith({
      uri: "mysql://user:pass@localhost:3306/db",
      connectionLimit: 10,
      queueLimit: 50,
      connectTimeout: 5000,
      idleTimeout: 30000,
    });
  });

  it("recreates the pool after close so the next caller gets a fresh one", async () => {
    const a = getPool();
    await closeDb();
    // Simulate a new pool being constructed after close by varying the
    // createPool return value, which is the realistic lifecycle.
    const freshPool = { getConnection: getConnectionMock, end: endMock };
    createPoolMock.mockReturnValueOnce(freshPool);
    const b = getPool();
    expect(b).toBe(freshPool);
    expect(b).not.toBe(a);
    expect(createPoolMock).toHaveBeenCalledTimes(2);
  });
});

describe("pingDb", () => {
  it("acquires a connection, pings, and releases it", async () => {
    await pingDb();
    expect(getConnectionMock).toHaveBeenCalledTimes(1);
    expect(pingMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("still releases the connection when the ping rejects", async () => {
    pingMock.mockRejectedValueOnce(new Error("boom"));
    await expect(pingDb()).rejects.toThrow("boom");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});

describe("closeDb", () => {
  it("ends the underlying pool and resets the singleton", async () => {
    getPool();
    await closeDb();
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no pool has been created", async () => {
    await expect(closeDb()).resolves.toBeUndefined();
    expect(endMock).not.toHaveBeenCalled();
  });
});
