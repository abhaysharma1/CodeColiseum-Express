// Backward-compatible entry point. All Prisma access is centralized in
// `infrastructure/database`; existing imports keep working during migration.
export { prisma as default, prisma } from "@/infrastructure/database/prisma";
