import type { Response } from "express";

/**
 * Single error envelope used by the centralized error handler.
 *
 * `message` is duplicated at the top level for backward compatibility with the
 * legacy clients that read `response.message`.
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function buildErrorResponse(
  code: string,
  message: string,
  options: { details?: unknown; requestId?: string } = {},
): ApiErrorResponse {
  return {
    success: false,
    message,
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  };
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  options: { details?: unknown; requestId?: string } = {},
): Response {
  return res.status(statusCode).json(buildErrorResponse(code, message, options));
}
