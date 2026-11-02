export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE";

export interface AppErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
  isOperational?: boolean;
}

/**
 * Base class for all expected application failures. Anything that is not an
 * `AppError` is treated as an unexpected error by the centralized handler and
 * never exposed to the client.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    options: AppErrorOptions = {},
  ) {
    super(message);

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }

    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = options.code ?? "INTERNAL_SERVER_ERROR";
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;

    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 400, { code: "VALIDATION_ERROR", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, { code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, { code: "FORBIDDEN", details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, 404, { code: "NOT_FOUND", details });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Request conflicts with the current state", details?: unknown) {
    super(message, 409, { code: "CONFLICT", details });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, { code: "TOO_MANY_REQUESTS" });
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error", cause?: unknown) {
    super(message, 500, {
      code: "INTERNAL_SERVER_ERROR",
      cause,
      isOperational: false,
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(message, 503, { code: "SERVICE_UNAVAILABLE" });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalizes unknown thrown values into an `AppError`. Legacy code attaches an
 * ad-hoc `status`/`statusCode`; those are honoured so behaviour is preserved
 * while modules are migrated one by one.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const legacyStatus = (error as Error & {
      status?: unknown;
      statusCode?: unknown;
    }).status ?? (error as Error & { statusCode?: unknown }).statusCode;

    if (typeof legacyStatus === "number" && legacyStatus >= 400) {
      const status = legacyStatus;
      const code =
        status === 400
          ? "VALIDATION_ERROR"
          : status === 401
            ? "UNAUTHORIZED"
            : status === 403
              ? "FORBIDDEN"
              : status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "CONFLICT"
                  : status === 429
                    ? "TOO_MANY_REQUESTS"
                    : status >= 500
                      ? "INTERNAL_SERVER_ERROR"
                      : "INTERNAL_SERVER_ERROR";

      return new AppError(error.message || "Request failed", status, {
        code,
        cause: error,
      });
    }

    return new InternalServerError("Internal server error", error);
  }

  return new InternalServerError("Internal server error", error);
}
