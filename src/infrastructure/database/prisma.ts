import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client";
import { databaseUrl, isTest } from "@/config/env";

const TEST_FALLBACK_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/codecoliseum";

const rawConnectionString =
  databaseUrl ?? (isTest ? TEST_FALLBACK_DATABASE_URL : undefined);

if (!rawConnectionString) {
  throw new Error(
    "DIRECT_URL or DATABASE_URL must be set before the Prisma client is created",
  );
}

const connectionUrl = new URL(rawConnectionString);
const useLibpqCompat = process.env.PG_USE_LIBPQ_COMPAT === "true";

if (useLibpqCompat) {
  connectionUrl.searchParams.set("uselibpqcompat", "true");
  if (!connectionUrl.searchParams.has("sslmode")) {
    connectionUrl.searchParams.set("sslmode", "require");
  }
} else if (!connectionUrl.searchParams.has("sslmode")) {
  connectionUrl.searchParams.set("sslmode", "verify-full");
}

/**
 * Single Prisma client for the whole process. Repositories import this
 * instance; controllers and services must never construct their own client.
 */
const adapter = new PrismaPg({ connectionString: connectionUrl.toString() });

export const prisma = new PrismaClient({ adapter });

export type PrismaTransactionClient = Prisma.TransactionClient;

export default prisma;
