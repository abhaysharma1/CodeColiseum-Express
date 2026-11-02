import prisma, { type PrismaTransactionClient } from "./prisma";

/**
 * Runs a callback inside a single database transaction. Prefer this over
 * calling `prisma.$transaction` in controllers so transaction boundaries stay
 * in the persistence/service layer.
 */
export function runInTransaction<T>(
  callback: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(callback);
}

export type { PrismaTransactionClient };
