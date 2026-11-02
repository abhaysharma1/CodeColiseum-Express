import express, { type Application } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@/utils/auth";
import { appConfig } from "@/config/app.config";
import { logger } from "@/config/logger";
import { errorHandler, notFoundHandler } from "@/middleware/error-handler";
import { requestId } from "@/middleware/request-id";
import { requestLogger } from "@/middleware/request-logger";
import {
  authRateLimit,
  globalRateLimit,
} from "@/middleware/rate-limit";
import {
  adminRouter,
  authRouter,
  formatterRouter,
  healthRouter,
  internalRouter,
  labStudentRouter,
  labTeacherRouter,
  marketplaceRouter,
  notificationsRouter,
  permissionsRouter,
  problemsRouter,
  sebRouter,
  studentRouter,
  teacherRouter,
} from "@/modules";

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", appConfig.trustProxy);

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin/non-browser requests have no Origin header.
        if (!origin || appConfig.cors.origins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      allowedHeaders: [...appConfig.cors.allowedHeaders],
      credentials: appConfig.cors.credentials,
      optionsSuccessStatus: appConfig.cors.optionsSuccessStatus,
    }),
  );

  if (appConfig.rateLimit.enabled) {
    app.use("/api", globalRateLimit);
    app.use("/api/public-auth", authRateLimit);
  }

  // Better Auth handles its own body parsing, so it must be mounted before
  // express.json().
  app.use("/api/auth", toNodeHandler(auth));

  app.use(cookieParser());
  app.use(express.json({ limit: appConfig.body.jsonLimit }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: appConfig.body.urlEncodedLimit,
    }),
  );

  app.use("/", healthRouter);
  app.use("/api/seb", sebRouter);

  app.use("/api/teacher", teacherRouter);
  app.use("/api/teacher", labTeacherRouter);
  app.use("/api/student", studentRouter);
  app.use("/api/student", labStudentRouter);
  app.use("/api/marketplace", marketplaceRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/problems", problemsRouter);
  app.use("/api/internal", internalRouter);
  app.use("/api/permissions", permissionsRouter);
  app.use("/api/public-auth", authRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/tools", formatterRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

logger.debug("express application composed", {
  modules: [
    "auth",
    "problems",
    "notifications",
    "permissions",
    "marketplace",
    "formatter",
    "system",
    "teacher",
    "student",
    "admin",
    "internal",
  ],
});

export default app;
