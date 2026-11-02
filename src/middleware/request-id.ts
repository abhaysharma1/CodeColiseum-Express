import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

  const id =
    candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();

  req.requestId = id;
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);

  next();
}
