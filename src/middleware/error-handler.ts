import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import { ZodError } from "zod";
import {
  AppError,
  isAppError,
  toAppError,
} from "@/shared/errors";
import {
  buildErrorResponse,
  type ApiErrorResponse,
} from "@/shared/http/api-response";
import { logger } from "@/config/logger";
import { redact } from "@/shared/utils/redact";

function getRequestId(req: Request): string | undefined {
  return req.requestId;
}

function mapPrismaError(
  error: Prisma.PrismaClientKnownRequestError,
): AppError {
  switch (error.code) {
    case "P2002":
      return new AppError("Resource already exists", 409, {
        code: "CONFLICT",
        details: redact(error.meta),
        cause: error,
      });
    case "P2025":
      return new AppError("Resource not found", 404, {
        code: "NOT_FOUND",
        cause: error,
      });
    case "P2003":
      return new AppError("Related resource constraint failed", 409, {
        code: "CONFLICT",
        cause: error,
      });
    default:
      return new AppError("Database request failed", 500, {
        code: "INTERNAL_SERVER_ERROR",
        isOperational: false,
        cause: error,
      });
  }
}

function buildResponse(error: unknown, req: Request): {
  statusCode: number;
  body: ApiErrorResponse;
  logLevel: "warn" | "error";
} {
  const requestId = getRequestId(req);

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    return {
      statusCode: 400,
      body: buildErrorResponse("VALIDATION_ERROR", "Validation failed", {
        details,
        requestId,
      }),
      logLevel: "warn",
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const appError = mapPrismaError(error);
    return {
      statusCode: appError.statusCode,
      body: buildErrorResponse(appError.code, appError.message, {
        requestId,
      }),
      logLevel: appError.statusCode >= 500 ? "error" : "warn",
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      body: buildErrorResponse("VALIDATION_ERROR", "Invalid database query", {
        requestId,
      }),
      logLevel: "warn",
    };
  }

  // Body parser errors are raised as SyntaxError with a `status` property.
  if (error instanceof SyntaxError && "body" in error) {
    return {
      statusCode: 400,
      body: buildErrorResponse("VALIDATION_ERROR", "Malformed JSON body", {
        requestId,
      }),
      logLevel: "warn",
    };
  }

  const appError = toAppError(error);

  if (!isAppError(error) && appError.statusCode >= 500) {
    return {
      statusCode: 500,
      body: buildErrorResponse(
        "INTERNAL_SERVER_ERROR",
        "Internal server error",
        { requestId },
      ),
      logLevel: "error",
    };
  }

  return {
    statusCode: appError.statusCode,
    body: buildErrorResponse(appError.code, appError.message, {
      details:
        appError.details === undefined ? undefined : redact(appError.details),
      requestId,
    }),
    logLevel: appError.statusCode >= 500 ? "error" : "warn",
  };
}

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = getRequestId(req);

  res.status(404).json(
    buildErrorResponse("NOT_FOUND", "Resource not found", { requestId }),
  );
}

/**
 * Central error handler. Must be registered after all routes and the 404
 * handler. It is the only place that decides what an error looks like over
 * HTTP and it never leaks stack traces or driver messages.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { statusCode, body, logLevel } = buildResponse(error, req);

  const logPayload = {
    requestId: getRequestId(req),
    method: req.method,
    path: req.originalUrl,
    statusCode,
    errorCode: body.error.code,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : error,
  };

  if (logLevel === "error") {
    logger.error("request failed", logPayload);
  } else {
    logger.warn("request rejected", logPayload);
  }

  res.status(statusCode).json(body);
}
