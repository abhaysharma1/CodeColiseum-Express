import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  isAppError,
  toAppError,
} from "@/shared/errors";

describe("AppError hierarchy", () => {
  it("maps each error type to its HTTP status and code", () => {
    expect(new ValidationError().statusCode).toBe(400);
    expect(new ValidationError().code).toBe("VALIDATION_ERROR");
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new InternalServerError().statusCode).toBe(500);
  });

  it("keeps the message and details", () => {
    const error = new ValidationError("Invalid payload", {
      field: "email",
    });

    expect(error.message).toBe("Invalid payload");
    expect(error.details).toEqual({ field: "email" });
    expect(isAppError(error)).toBe(true);
  });

  it("preserves legacy status properties when normalizing", () => {
    const legacy = new Error("Question ID is required");
    (legacy as Error & { status?: number }).status = 400;

    const normalized = toAppError(legacy);

    expect(normalized).toBeInstanceOf(AppError);
    expect(normalized.statusCode).toBe(400);
    expect(normalized.code).toBe("VALIDATION_ERROR");
    expect(normalized.message).toBe("Question ID is required");
  });

  it("hides unexpected errors behind an internal error", () => {
    const normalized = toAppError(new Error("database password leaked"));

    expect(normalized.statusCode).toBe(500);
    expect(normalized.message).toBe("Internal server error");
    expect(normalized).toBeInstanceOf(InternalServerError);
  });
});
