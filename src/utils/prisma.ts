
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; // Example for PostgreSQL
import "dotenv/config"

const rawConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawConnectionString) {
	throw new Error("DIRECT_URL or DATABASE_URL must be set");
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

const connectionString = connectionUrl.toString();
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export default prisma;
