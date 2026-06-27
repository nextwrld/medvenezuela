import "dotenv/config";
import { z } from "zod";

// `parseEnv` is the single source of truth for backend configuration. It is a
// pure function so unit tests can drive it without touching `process.env`,
// and so the production boot path can re-run it after `dotenv` has loaded
// the runtime .env file. All field shapes and bounds are enforced here,
// which is what `2.1 Zod parsing for backend env` and the
// production-runtime spec require.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_ID: z.string().min(1),
  APP_SECRET: z.string().min(1),
  KIMI_AUTH_URL: z.string().url(),
  KIMI_OPEN_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  OWNER_UNION_ID: z.string().default(""),
  DB_POOL_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  DB_QUEUE_LIMIT: z.coerce.number().int().min(0).max(10_000).default(0),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
});

export interface PoolConfig {
  connectionLimit: number;
  queueLimit: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
}

export interface ParsedEnv {
  nodeEnv: "development" | "production" | "test";
  isProduction: boolean;
  appId: string;
  appSecret: string;
  databaseUrl: string;
  kimiAuthUrl: string;
  kimiOpenUrl: string;
  port: number;
  ownerUnionId: string;
  pool: PoolConfig;
}

function buildEnv(data: z.infer<typeof envSchema>): ParsedEnv {
  return {
    nodeEnv: data.NODE_ENV,
    isProduction: data.NODE_ENV === "production",
    appId: data.APP_ID,
    appSecret: data.APP_SECRET,
    databaseUrl: data.DATABASE_URL,
    kimiAuthUrl: data.KIMI_AUTH_URL,
    kimiOpenUrl: data.KIMI_OPEN_URL,
    port: data.PORT,
    ownerUnionId: data.OWNER_UNION_ID,
    pool: {
      connectionLimit: data.DB_POOL_LIMIT,
      queueLimit: data.DB_QUEUE_LIMIT,
      connectTimeoutMs: data.DB_CONNECT_TIMEOUT_MS,
      idleTimeoutMs: data.DB_IDLE_TIMEOUT_MS,
    },
  };
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): ParsedEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return buildEnv(result.data);
}

// `makeLenientStub` returns a ParsedEnv populated from whatever subset of
// `process.env` happens to be set. It is used by the dev/test fallback so
// the import chain (and any incidental `env.x` reads) keeps working when
// nothing is configured. It is never used in production.
function makeLenientStub(): ParsedEnv {
  const read = (key: string) => process.env[key] ?? "";
  const readInt = (key: string, fallback: number) => {
    const v = process.env[key];
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const nodeEnvRaw = (process.env.NODE_ENV as ParsedEnv["nodeEnv"]) ?? "development";
  return {
    nodeEnv: nodeEnvRaw,
    isProduction: nodeEnvRaw === "production",
    appId: read("APP_ID"),
    appSecret: read("APP_SECRET"),
    databaseUrl: read("DATABASE_URL"),
    kimiAuthUrl: read("KIMI_AUTH_URL"),
    kimiOpenUrl: read("KIMI_OPEN_URL"),
    port: readInt("PORT", 3000),
    ownerUnionId: read("OWNER_UNION_ID"),
    pool: {
      connectionLimit: readInt("DB_POOL_LIMIT", 10),
      queueLimit: readInt("DB_QUEUE_LIMIT", 0),
      connectTimeoutMs: readInt("DB_CONNECT_TIMEOUT_MS", 10_000),
      idleTimeoutMs: readInt("DB_IDLE_TIMEOUT_MS", 60_000),
    },
  };
}

// `env` is a lazy proxy. Production callers see strict validation
// (`parseEnv` runs on first read and throws if anything is missing or
// invalid). Dev/test callers see a lenient stub so the import chain
// keeps working without a populated `.env`. The split is governed by
// `NODE_ENV` at the moment of first read.
let _cached: ParsedEnv | null = null;
function load(): ParsedEnv {
  if (_cached) return _cached;
  try {
    _cached = parseEnv();
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    _cached = makeLenientStub();
  }
  return _cached;
}

export const env: ParsedEnv = new Proxy({} as ParsedEnv, {
  get(_target, prop) {
    return Reflect.get(load() as object, prop);
  },
});
