import { corsOrigins, env, isProduction } from "@/config/env";

export const appConfig = {
  env: env.NODE_ENV,
  isProduction,
  port: env.PORT,
  trustProxy: env.TRUST_PROXY === "true",
  body: {
    jsonLimit: env.JSON_BODY_LIMIT,
    urlEncodedLimit: env.JSON_BODY_LIMIT,
  },
  cors: {
    origins: corsOrigins,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
      "X-SafeExamBrowser-RequestHash",
      "X-SafeExamBrowser-ConfigKeyHash",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  },
  rateLimit: {
    enabled: env.RATE_LIMIT_DISABLED !== "true" && env.NODE_ENV !== "test",
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authMax: 30,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const;
