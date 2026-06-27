import { z } from "zod";

// `validateBuildEnv` is the Vite build-time counterpart to `parseEnv` in
// `api/lib/env.ts`. The design splits the configuration boundary into:
//   - backend runtime variables: validated at boot in `boot.ts`
//   - frontend public build variables: validated at build time here
// Production builds must fail closed if either `VITE_KIMI_AUTH_URL` is not
// a URL or `VITE_APP_ID` is empty, because the resulting bundle would either
// crash at runtime or expose an incomplete public client.
//
// Non-production builds are intentionally permissive: developers frequently
// run `vite` against an empty `.env` while scaffolding the app, and failing
// the build in that case would block the inner dev loop without changing
// what actually ships.

const buildEnvSchema = z.object({
  VITE_KIMI_AUTH_URL: z.string().url(),
  VITE_APP_ID: z.string().min(1),
});

export function validateBuildEnv(
  mode: string,
  env: Record<string, string>,
): void {
  if (mode !== "production") return;
  const result = buildEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`Invalid build-time environment: ${issues}`);
  }
}
