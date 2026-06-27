#!/usr/bin/env node
// verify-build-env.mjs
//
// Preflight guard for `release:verify`. Fails fast with a clear, named error
// when one or more build-time env vars are missing or empty, BEFORE the Vite
// build would surface the same problem as a stack trace inside the bundler.
//
// Pure helper exported for unit tests; CLI block is reserved for the entry
// point at the bottom and matches the `schema-contract.mjs` convention.
//
// Public API (pure, no I/O):
//   - REQUIRED_BUILD_ENV_VARS
//   - checkBuildEnv(env, required)

export const REQUIRED_BUILD_ENV_VARS = Object.freeze([
  "VITE_KIMI_AUTH_URL",
  "VITE_APP_ID",
]);

// `checkBuildEnv` reports every missing or empty-required var in a single
// pass. Empty / whitespace-only values count as missing because Vite's
// build-time schema (`z.string().url()` for the auth URL,
// `z.string().min(1)` for the app id) rejects them — agreeing here means
// the preflight and the build never disagree.
export function checkBuildEnv(env, required) {
  const missing = [];
  for (const name of required) {
    const value = env?.[name];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.push(name);
    }
  }
  return { ok: missing.length === 0, missing };
}

function main() {
  const result = checkBuildEnv(process.env, REQUIRED_BUILD_ENV_VARS);
  if (!result.ok) {
    console.error(
      `release:verify: missing required build env vars: ${result.missing.join(", ")}`,
    );
    console.error(
      "Set them in .env or in the calling environment before running release:verify.",
    );
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = main();
  process.exit(code);
}
