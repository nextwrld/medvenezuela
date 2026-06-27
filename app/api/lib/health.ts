import { Hono } from "hono";
import { pingDb } from "../queries/connection";

// `isReady` is the pure decision the readiness probe makes. The
// production-runtime spec requires a 503 response when the database
// is unreachable; the spec also implies that liveness must not depend
// on dependencies, so live/ready are split. The `readyHandler` calls
// `isReady` so the test suite can drive the decision without going
// through the Hono app.
export async function isReady(): Promise<{ ready: boolean; reason?: string }> {
  try {
    await pingDb();
    return { ready: true };
  } catch {
    return { ready: false, reason: "database" };
  }
}

export const liveHandler = (c: { json: (body: unknown, status: number) => Response }) =>
  c.json({ status: "alive" }, 200);

export const readyHandler = async (c: {
  json: (body: unknown, status: number) => Response;
}) => {
  const { ready, reason } = await isReady();
  if (ready) {
    return c.json({ status: "ready" }, 200);
  }
  return c.json({ status: "not ready", reason }, 503);
};

// `buildHealthApp` is exported so tests can hit the routes through a
// Hono app without wiring it into the real boot module. boot.ts uses
// the same `liveHandler` and `readyHandler` directly to keep its own
// router as the single source of routing truth.
export function buildHealthApp() {
  const app = new Hono();
  app.get("/health/live", liveHandler);
  app.get("/health/ready", readyHandler);
  return app;
}
