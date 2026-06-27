import { describe, it, expect } from "vitest";
import { validateBuildEnv } from "./build-env";

describe("validateBuildEnv", () => {
  describe("production mode", () => {
    it("passes when VITE_KIMI_AUTH_URL and VITE_APP_ID are present", () => {
      expect(() =>
        validateBuildEnv("production", {
          VITE_KIMI_AUTH_URL: "https://auth.example.com",
          VITE_APP_ID: "client-123",
        }),
      ).not.toThrow();
    });

    it("throws when VITE_KIMI_AUTH_URL is missing", () => {
      expect(() =>
        validateBuildEnv("production", { VITE_APP_ID: "client-123" }),
      ).toThrow(/VITE_KIMI_AUTH_URL/);
    });

    it("throws when VITE_KIMI_AUTH_URL is not a valid URL", () => {
      expect(() =>
        validateBuildEnv("production", {
          VITE_KIMI_AUTH_URL: "not-a-url",
          VITE_APP_ID: "client-123",
        }),
      ).toThrow(/VITE_KIMI_AUTH_URL/);
    });

    it("throws when VITE_APP_ID is missing", () => {
      expect(() =>
        validateBuildEnv("production", {
          VITE_KIMI_AUTH_URL: "https://auth.example.com",
        }),
      ).toThrow(/VITE_APP_ID/);
    });

    it("throws when VITE_APP_ID is empty", () => {
      expect(() =>
        validateBuildEnv("production", {
          VITE_KIMI_AUTH_URL: "https://auth.example.com",
          VITE_APP_ID: "",
        }),
      ).toThrow(/VITE_APP_ID/);
    });

    it("reports all invalid build env fields at once", () => {
      expect(() => validateBuildEnv("production", {})).toThrow(
        /VITE_KIMI_AUTH_URL.*VITE_APP_ID|VITE_APP_ID.*VITE_KIMI_AUTH_URL/,
      );
    });
  });

  describe("non-production modes", () => {
    it("does not throw in development when build env vars are missing", () => {
      expect(() => validateBuildEnv("development", {})).not.toThrow();
    });

    it("does not throw in test when build env vars are missing", () => {
      expect(() => validateBuildEnv("test", {})).not.toThrow();
    });

    it("does not throw in development even if values are invalid", () => {
      expect(() =>
        validateBuildEnv("development", {
          VITE_KIMI_AUTH_URL: "garbage",
          VITE_APP_ID: "",
        }),
      ).not.toThrow();
    });
  });
});
