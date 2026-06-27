// Vitest setup: provide a populated, valid `process.env` BEFORE any module
// is imported so the import chain (env -> kimi/auth -> context -> router)
// can resolve without throwing. Individual tests that want to assert
// failure paths pass a custom `source` to `parseEnv` and never touch
// `process.env` here.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "mysql://test:test@localhost:3306/test";
process.env.APP_ID ??= "test-app";
process.env.APP_SECRET ??= "test-secret";
process.env.KIMI_AUTH_URL ??= "https://auth.example.com";
process.env.KIMI_OPEN_URL ??= "https://open.example.com";
process.env.OWNER_UNION_ID ??= "";
