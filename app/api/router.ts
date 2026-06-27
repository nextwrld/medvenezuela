import { authRouter } from "./auth-router";
import { localAuthRouter } from "./local-auth-router";
import { solicitudesRouter } from "./solicitudes-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  solicitudes: solicitudesRouter,
});

export type AppRouter = typeof appRouter;
