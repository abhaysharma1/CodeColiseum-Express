import "dotenv/config";
import { z } from "zod";

/**
 * Environment configuration is parsed once at import time.
 *
 * Only infrastructure-level variables are interpreted here. Feature-specific
 * variables (queue URLs, formatter paths, SEB keys, …) stay accessible through
 * `process.env` until the owning module adopts them.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  FRONTEND_URL: z.string().trim().min(1).default("http://localhost:3000"),
  DATABASE_URL: z.string().trim().min(1).optional(),
  DIRECT_URL: z.string().trim().min(1).optional(),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "http", "debug"])
    .default("info"),
  JSON_BODY_LIMIT: z.string().trim().min(1).default("10mb"),
  TRUST_PROXY: z.enum(["true", "false"]).default("true"),
  CORS_ORIGINS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1_000),
  RATE_LIMIT_DISABLED: z.enum(["true", "false"]).default("false"),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  // Throwing is intentional: a misconfigured process must not boot.
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env: Env = parsedEnv.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const isDevelopment = env.NODE_ENV === "development";

export const databaseUrl: string | undefined =
  env.DIRECT_URL ?? env.DATABASE_URL;

/**
 * `DATABASE_URL` is intentionally optional in the schema so that unit tests and
 * tooling can import modules without a database. Production boot must call this
 * assertion before serving traffic.
 */
export function assertRuntimeEnvironment(): void {
  const missing: string[] = [];

  if (!databaseUrl) {
    missing.push("DATABASE_URL (or DIRECT_URL)");
  }

  if (isProduction && !process.env.BETTER_AUTH_SECRET) {
    missing.push("BETTER_AUTH_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

function parseCorsOrigins(): string[] {
  const configured = env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return [env.FRONTEND_URL];
}

export const corsOrigins: string[] = parseCorsOrigins();
