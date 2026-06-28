import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env, parseEnv } from "./lib/env";
import { pingDb } from "./queries/connection";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { liveHandler, readyHandler } from "./lib/health";
import { Paths } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
// Liveness and readiness probes. They run before the tRPC adapter so
// orchestrators can hit them without the tRPC envelope.
app.get("/health/live", liveHandler);
app.get("/health/ready", readyHandler);
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// `performBootChecks` is the testable boot path. In production it
// re-runs `parseEnv` to surface any missing or malformed env value as
// a hard failure, then pings the database pool so a misconfigured
// connection string is caught before any request is served. In
// development the env re-check is skipped (env is already lazy and
// lenient there) but the pool is still probed so misconfiguration
// surfaces early.
export async function performBootChecks(): Promise<void> {
  if (env.isProduction) {
    parseEnv();
  }
  await pingDb();
}

export default app;

if (env.isProduction) {
  // `performBootChecks` re-runs env validation and pings the pool.
  // It MUST run before we open a port: if env is invalid or the
  // database is unreachable, we want the process to fail closed here
  // rather than start serving traffic against a broken dependency.
  await performBootChecks();

  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  // Use the validated port from `env.port` rather than re-parsing the
  // raw env value; parseEnv has already enforced bounds.
  serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, () => {
    console.log(`Server running on http://0.0.0.0:${env.port}/`);
  });
}
