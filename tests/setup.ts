/**
 * Test environment defaults. Real values from `.env` win because dotenv does
 * not override existing process variables.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/codecoliseum";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:5000";
process.env.FRONTEND_URL ??= "http://localhost:3000";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.CRON_SECRET ??= "test-cron-secret";
