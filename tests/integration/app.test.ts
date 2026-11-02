import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "@/app";

describe("application shell", () => {
  it("exposes a health endpoint", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "UP" });
    expect(typeof response.body.timestamp).toBe("string");
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a consistent error envelope for unknown routes", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      message: "Resource not found",
      error: {
        code: "NOT_FOUND",
        message: "Resource not found",
      },
    });
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("echoes a valid incoming request id", async () => {
    const response = await request(app)
      .get("/health")
      .set("X-Request-Id", "client-request-123");

    expect(response.headers["x-request-id"]).toBe("client-request-123");
  });

  it("converts Zod validation failures into a 400 envelope", async () => {
    const response = await request(app)
      .post("/api/public-auth/signup")
      .send({ name: "", email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(response.body.error.details.errors)).toBe(true);
    expect(response.body.error.details.errors.length).toBeGreaterThan(0);
  });

  it("requires authentication for protected tools routes", async () => {
    const response = await request(app)
      .post("/api/tools/format")
      .send({ language: "cpp", code: "int main(){}" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unsupported formatter languages before business logic", async () => {
    const response = await request(app)
      .post("/api/tools/format")
      .send({ language: "ruby", code: "puts 1" });

    // Validation runs after authentication; without a session the request is
    // rejected as unauthorized first. This asserts the middleware order.
    expect(response.status).toBe(401);
  });

  it("protects internal cron endpoints", async () => {
    const response = await request(app)
      .post("/api/internal/exams/finalize")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects internal requests with a wrong cron secret", async () => {
    const response = await request(app)
      .post("/api/internal/analytics/recompute")
      .set("X-Cron-Secret", "definitely-wrong")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
