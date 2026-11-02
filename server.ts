import http from "http";
import app from "./src/app";
import { loadSebConfig } from "@/config/ssm";
import { assertRuntimeEnvironment, env, isProduction } from "@/config/env";
import { logger } from "@/config/logger";
import { prisma } from "@/infrastructure/database/prisma";

const SHUTDOWN_TIMEOUT_MS = 10_000;

export function createServer(): http.Server {
  return http.createServer(app);
}

export async function startServer(): Promise<http.Server> {
  assertRuntimeEnvironment();

  await prisma.$connect();
  logger.info("database connected", { env: env.NODE_ENV });

  if (isProduction) {
    await loadSebConfig();
    logger.info("SEB configuration loaded");
  }

  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.PORT, () => {
      server.off("error", reject);
      resolve();
    });
  });

  logger.info("server started", {
    port: env.PORT,
    env: env.NODE_ENV,
  });

  registerShutdownHooks(server);

  return server;
}

async function shutdown(server: http.Server, signal: string): Promise<void> {
  logger.info("graceful shutdown started", { signal });

  const forceExit = setTimeout(() => {
    logger.error("graceful shutdown timed out", { signal });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      logger.error("http server failed to close", {
        signal,
        reason: error.message,
      });
    }

    try {
      await prisma.$disconnect();
      logger.info("database disconnected");
    } catch (disconnectError) {
      logger.error("database disconnect failed", {
        reason:
          disconnectError instanceof Error
            ? disconnectError.message
            : "unknown error",
      });
    }

    clearTimeout(forceExit);
    process.exit(error ? 1 : 0);
  });
}

function registerShutdownHooks(server: http.Server): void {
  process.on("SIGTERM", () => {
    void shutdown(server, "SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown(server, "SIGINT");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled rejection", {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    void shutdown(server, "unhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception", {
      reason: error.message,
      stack: error.stack,
    });
    void shutdown(server, "uncaughtException");
  });
}

startServer().catch((error: unknown) => {
  logger.error("failed to start server", {
    reason: error instanceof Error ? error.message : error,
  });
  process.exit(1);
});

export { app };
