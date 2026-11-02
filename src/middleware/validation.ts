import type { Request, RequestHandler } from "express";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { ValidationError } from "@/shared/errors";

export interface RequestValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface ValidatedPayload {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Parses body/query/params with Zod before the controller runs. Parsed values
 * are exposed through `req.validated` and `req.body` so controllers never
 * re-parse or cast raw input.
 */
export function validateRequest(
  schemas: RequestValidationSchemas,
): RequestHandler {
  return (req, _res, next) => {
    try {
      const validated: ValidatedPayload = {};

      if (schemas.body) {
        validated.body = schemas.body.parse(req.body);
        req.body = validated.body;
      }

      if (schemas.query) {
        validated.query = schemas.query.parse(req.query);
      }

      if (schemas.params) {
        validated.params = schemas.params.parse(req.params);
      }

      req.validated = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError("Validation failed", {
            errors: formatZodError(error),
          }),
        );
        return;
      }

      next(error);
    }
  };
}

export function validateBody(schema: ZodType): RequestHandler {
  return validateRequest({ body: schema });
}

export function getValidatedBody<T>(req: Request): T {
  return (req.validated?.body ?? req.body) as T;
}

export function getValidatedQuery<T>(req: Request): T {
  return (req.validated?.query ?? req.query) as T;
}

export function getValidatedParams<T>(req: Request): T {
  return (req.validated?.params ?? req.params) as T;
}
