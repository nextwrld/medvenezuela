// Integration test: production auth boundary.
//
// STRUCTURAL / STUB-LEVEL test. The spec scenarios it covers are:
//
//   production-runtime / Runtime environment validation
//     - Valid production env boots (proven by parseEnv returning a
//       structured ParsedEnv with the production flag set).
//     - Missing env fails fast (proven by parseEnv throwing an error
//       that names the missing or invalid field).
//
// The full end-to-end boot path (parseEnv -> pingDb -> listen) lives
// in `api/boot.test.ts`. The contract verified here is that the env
// boundary the boot path depends on is strict, well-typed, and
// surfaces every invalid field.

import { describe, it, expect } from "vitest";
import { parseEnv } from "../lib/env";

const validBase: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  APP_ID: "test-app",
  APP_SECRET: "test-secret",
  KIMI_AUTH_URL: "https://auth.example.com",
  KIMI_OPEN_URL: "https://open.example.com",
};

describe("integration: production auth boundary (structural)", () => {
  it("parses a complete production env into a typed ParsedEnv", () => {
    const result = parseEnv(validBase);
    expect(result.isProduction).toBe(true);
    expect(result.appId).toBe("test-app");
    expect(result.appSecret).toBe("test-secret");
    expect(result.databaseUrl).toBe("mysql://user:pass@localhost:3306/db");
    expect(result.kimiAuthUrl).toBe("https://auth.example.com");
    expect(result.kimiOpenUrl).toBe("https://open.example.com");
  });

  it("rejects a production env missing APP_SECRET with a clear error", () => {
    const { APP_SECRET: _dropped, ...rest } = validBase;
    expect(() => parseEnv(rest)).toThrow(/APP_SECRET/);
  });

  it("rejects a production env with an invalid DATABASE_URL", () => {
    expect(() => parseEnv({ ...validBase, DATABASE_URL: "not-a-url" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a production env with an out-of-bounds PORT", () => {
    expect(() => parseEnv({ ...validBase, PORT: "70000" })).toThrow(/PORT/);
  });

  it("rejects a production env with an out-of-bounds DB_POOL_LIMIT", () => {
    expect(() => parseEnv({ ...validBase, DB_POOL_LIMIT: "1000" })).toThrow(
      /DB_POOL_LIMIT/,
    );
  });

  it("collects multiple invalid fields into a single readable error", () => {
    expect(() =>
      parseEnv({ ...validBase, APP_ID: "", APP_SECRET: "" }),
    ).toThrow(/APP_ID.*APP_SECRET|APP_SECRET.*APP_ID/);
  });
});
