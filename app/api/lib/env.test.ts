import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const validBase = {
  NODE_ENV: "test",
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  APP_ID: "test-app",
  APP_SECRET: "test-secret",
  KIMI_AUTH_URL: "https://auth.example.com",
  KIMI_OPEN_URL: "https://open.example.com",
};

describe("parseEnv", () => {
  describe("happy path", () => {
    it("returns a parsed env with all required fields", () => {
      const result = parseEnv(validBase);
      expect(result.appId).toBe("test-app");
      expect(result.appSecret).toBe("test-secret");
      expect(result.databaseUrl).toBe("mysql://user:pass@localhost:3306/db");
      expect(result.kimiAuthUrl).toBe("https://auth.example.com");
      expect(result.kimiOpenUrl).toBe("https://open.example.com");
    });

    it("defaults PORT to 3000 when PORT is missing", () => {
      const result = parseEnv(validBase);
      expect(result.port).toBe(3000);
    });

    it("coerces a numeric PORT string into a number", () => {
      const result = parseEnv({ ...validBase, PORT: "8080" });
      expect(result.port).toBe(8080);
    });

    it("defaults ownerUnionId to empty string when OWNER_UNION_ID is missing", () => {
      const result = parseEnv(validBase);
      expect(result.ownerUnionId).toBe("");
    });

    it("preserves ownerUnionId when provided", () => {
      const result = parseEnv({ ...validBase, OWNER_UNION_ID: "u-123" });
      expect(result.ownerUnionId).toBe("u-123");
    });

    it("defaults pool config to bounded values when missing", () => {
      const result = parseEnv(validBase);
      expect(result.pool).toEqual({
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeoutMs: 10000,
        idleTimeoutMs: 60000,
      });
    });

    it("coerces pool config string values into bounded integers", () => {
      const result = parseEnv({
        ...validBase,
        DB_POOL_LIMIT: "5",
        DB_QUEUE_LIMIT: "100",
        DB_CONNECT_TIMEOUT_MS: "3000",
        DB_IDLE_TIMEOUT_MS: "120000",
      });
      expect(result.pool.connectionLimit).toBe(5);
      expect(result.pool.queueLimit).toBe(100);
      expect(result.pool.connectTimeoutMs).toBe(3000);
      expect(result.pool.idleTimeoutMs).toBe(120000);
    });
  });

  describe("isProduction derivation", () => {
    it("isProduction is true when NODE_ENV=production", () => {
      const result = parseEnv({ ...validBase, NODE_ENV: "production" });
      expect(result.isProduction).toBe(true);
      expect(result.nodeEnv).toBe("production");
    });

    it("isProduction is false when NODE_ENV=development", () => {
      const result = parseEnv({ ...validBase, NODE_ENV: "development" });
      expect(result.isProduction).toBe(false);
      expect(result.nodeEnv).toBe("development");
    });

    it("isProduction is false when NODE_ENV=test", () => {
      const result = parseEnv({ ...validBase, NODE_ENV: "test" });
      expect(result.isProduction).toBe(false);
      expect(result.nodeEnv).toBe("test");
    });
  });

  describe("failure paths", () => {
    it("throws when DATABASE_URL is missing", () => {
      const { DATABASE_URL: _dropped, ...rest } = validBase;
      expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
    });

    it("throws when DATABASE_URL is not a valid URL", () => {
      expect(() => parseEnv({ ...validBase, DATABASE_URL: "not-a-url" })).toThrow(
        /DATABASE_URL/,
      );
    });

    it("throws when APP_ID is empty", () => {
      expect(() => parseEnv({ ...validBase, APP_ID: "" })).toThrow(/APP_ID/);
    });

    it("throws when APP_SECRET is empty", () => {
      expect(() => parseEnv({ ...validBase, APP_SECRET: "" })).toThrow(/APP_SECRET/);
    });

    it("throws when KIMI_AUTH_URL is missing", () => {
      const { KIMI_AUTH_URL: _dropped, ...rest } = validBase;
      expect(() => parseEnv(rest)).toThrow(/KIMI_AUTH_URL/);
    });

    it("throws when KIMI_OPEN_URL is not a valid URL", () => {
      expect(() =>
        parseEnv({ ...validBase, KIMI_OPEN_URL: "not-a-url" }),
      ).toThrow(/KIMI_OPEN_URL/);
    });

    it("throws when PORT is non-numeric", () => {
      expect(() => parseEnv({ ...validBase, PORT: "not-a-number" })).toThrow(
        /PORT/,
      );
    });

    it("throws when PORT is out of range (0)", () => {
      expect(() => parseEnv({ ...validBase, PORT: "0" })).toThrow(/PORT/);
    });

    it("throws when PORT exceeds TCP max (65536)", () => {
      expect(() => parseEnv({ ...validBase, PORT: "65536" })).toThrow(/PORT/);
    });

    it("throws when DB_POOL_LIMIT exceeds bound (101)", () => {
      expect(() => parseEnv({ ...validBase, DB_POOL_LIMIT: "101" })).toThrow(
        /DB_POOL_LIMIT/,
      );
    });

    it("collects multiple invalid fields in a single error message", () => {
      expect(() =>
        parseEnv({ ...validBase, APP_ID: "", APP_SECRET: "" }),
      ).toThrow(/APP_ID.*APP_SECRET|APP_SECRET.*APP_ID/);
    });
  });
});
