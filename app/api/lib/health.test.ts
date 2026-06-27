import { describe, it, expect, vi, beforeEach } from "vitest";

const { pingDbMock } = vi.hoisted(() => {
  const pingDbMock = vi.fn();
  return { pingDbMock };
});

vi.mock("../queries/connection", () => ({
  pingDb: pingDbMock,
}));

import { Hono } from "hono";
import { liveHandler, readyHandler, isReady, buildHealthApp } from "./health";

beforeEach(() => {
  pingDbMock.mockReset();
  pingDbMock.mockResolvedValue(undefined);
});

describe("liveHandler", () => {
  it("returns 200 with status=alive regardless of dependencies", async () => {
    // Even with a broken database, liveness must succeed — it describes
    // only the process state, not external services.
    pingDbMock.mockRejectedValueOnce(new Error("db down"));
    const app = buildHealthApp();
    const res = await app.request("/health/live");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "alive" });
  });
});

describe("isReady / readyHandler", () => {
  it("reports ready=true when the database ping succeeds", async () => {
    await expect(isReady()).resolves.toEqual({ ready: true });
  });

  it("reports ready=false with a database reason when the ping fails", async () => {
    pingDbMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(isReady()).resolves.toEqual({
      ready: false,
      reason: "database",
    });
  });

  it("returns 200 with status=ready when the database is reachable", async () => {
    const app = buildHealthApp();
    const res = await app.request("/health/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("returns 503 with status=not ready when the database is unreachable", async () => {
    pingDbMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const app = buildHealthApp();
    const res = await app.request("/health/ready");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ status: "not ready", reason: "database" });
  });
});

describe("buildHealthApp", () => {
  it("exposes both /health/live and /health/ready routes", async () => {
    const app = buildHealthApp();
    const live = await app.request("/health/live");
    const ready = await app.request("/health/ready");
    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});

// `liveHandler` and `readyHandler` exist as the building blocks the
// production Hono app uses. Their direct invocations just cover the
// happy path; the behavioral matrix above goes through buildHealthApp
// because that is what boot.ts wires in.
describe("handler shapes", () => {
  it("liveHandler returns a JSON response with status=alive", async () => {
    const app = new Hono().get("/health/live", liveHandler);
    const res = await app.request("/health/live");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "alive" });
  });

  it("readyHandler returns 200 when ready", async () => {
    const app = new Hono().get("/health/ready", readyHandler);
    const res = await app.request("/health/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });
});
