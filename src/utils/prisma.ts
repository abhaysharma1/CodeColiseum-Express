
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; // Example for PostgreSQL
import "dotenv/config"

const rawConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawConnectionString) {
	throw new Error("DIRECT_URL or DATABASE_URL must be set");
}

const connectionUrl = new URL(rawConnectionString);
const useLibpqCompat = process.env.PG_USE_LIBPQ_COMPAT === "true";
  
// Prisma's `?schema=...` param is not understood by `pg` connection strings.
// When using `@prisma/adapter-pg`, translate it into a real Postgres search_path.
const prismaSchema = connectionUrl.searchParams.get("schema");
if (prismaSchema) {
	const existingOptions = connectionUrl.searchParams.get("options");
	const searchPathOption = `-c search_path=${prismaSchema}`;

	if (existingOptions) {
		if (!existingOptions.includes("search_path")) {
			connectionUrl.searchParams.set("options", `${existingOptions} ${searchPathOption}`);
		}
	} else {
		connectionUrl.searchParams.set("options", searchPathOption);
	}

	connectionUrl.searchParams.delete("schema");
}

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
