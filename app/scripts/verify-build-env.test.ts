import { describe, it, expect } from "vitest";
import { checkBuildEnv } from "./verify-build-env.mjs";

// `checkBuildEnv` is the pure helper behind the `release:verify` env preflight.
// It MUST collect ALL missing vars (not just the first one) so a release
// engineer can fix every gap in a single iteration rather than running the
// gate over and over. Empty strings count as missing because Vite's build
// validator treats them as absent and the resulting bundle would be broken.
describe("checkBuildEnv", () => {
  it("returns ok=true with no missing vars when every required var is present and non-empty", () => {
    const env = {
      VITE_KIMI_AUTH_URL: "https://auth.example.com",
      VITE_APP_ID: "app-123",
      OTHER_UNRELATED: "ignored",
    };
    const required = ["VITE_KIMI_AUTH_URL", "VITE_APP_ID"];
    const result = checkBuildEnv(env, required);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("reports a single missing var by name (real production code path: lookup runs)", () => {
    const env = { VITE_APP_ID: "app-123" };
    const required = ["VITE_KIMI_AUTH_URL", "VITE_APP_ID"];
    const result = checkBuildEnv(env, required);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["VITE_KIMI_AUTH_URL"]);
  });

  it("treats empty string as missing (proves the trim/empty branch is reachable)", () => {
    // Vite's `z.string().min(1)` rejects "" at build time. The preflight must
    // agree, otherwise the gate would pass and the build would fail with a
    // less actionable error two steps later.
    const env = {
      VITE_KIMI_AUTH_URL: "",
      VITE_APP_ID: "   ",
    };
    const required = ["VITE_KIMI_AUTH_URL", "VITE_APP_ID"];
    const result = checkBuildEnv(env, required);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["VITE_KIMI_AUTH_URL", "VITE_APP_ID"]);
  });

  it("collects every missing var in one pass (triangulation: multi-var case)", () => {
    const env = {};
    const required = ["VITE_KIMI_AUTH_URL", "VITE_APP_ID"];
    const result = checkBuildEnv(env, required);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["VITE_KIMI_AUTH_URL", "VITE_APP_ID"]);
  });
});
