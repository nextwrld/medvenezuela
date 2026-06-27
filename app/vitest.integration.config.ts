import { defineConfig } from "vitest/config";
import path from "path";
import baseConfig from "./vitest.config";

// `vitest.integration.config.ts` — runs the integration suite.
//
// The unit suite (`vitest.config.ts`) runs on every change. The
// integration suite is opt-in and is part of the release verification
// gate (`npm run release:verify`). It exercises release-critical
// contracts at the boundary layer (migration files, schema diff,
// auth, and the createSolicitud public surface) and is intentionally
// runnable without a real MySQL — the structural checks below prove
// the contract surface stays stable even in CI environments where
// no disposable database is available.
//
// To extend this suite with real MySQL scenarios, add files matching
// the include pattern below and gate them on the presence of
// `process.env.DATABASE_URL`.

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "api/integration/**/*.integration.test.ts",
    ],
    // The integration suite should be fast and deterministic. There
    // is no live database here, but if a future test spins one up,
    // it must own its lifecycle and not leak connections across
    // files.
    pool: "forks",
  },
});
