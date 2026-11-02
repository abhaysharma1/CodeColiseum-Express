import { Request } from "express";
import { Exam } from "../../generated/prisma/client";
import prisma from "./prisma";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";
import crypto from "crypto";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { getSebConfig } from "@/config/ssm";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/errors";

export async function isStudent(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    throw new UnauthorizedError("Unauthorized");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { globalRoleId: true },
  });

  if (dbUser?.globalRoleId !== GLOBAL_ROLE_IDS.ORG_STUDENT) {
    throw new ForbiddenError("Forbidden: Student access required");
  }

  return { session };
}

export async function canGiveExam(examDetails: Exam, req: Request) {
  const { session } = await isStudent(req);
  await canGiveExamForUser(examDetails, session.user.id);
  return session;
}

/**
 * Session-independent eligibility check, shared by HTTP controllers and
 * queue/service callers.
 */
export async function canGiveExamForUser(
  examDetails: Exam,
  userId: string,
): Promise<void> {
  const now = Date.now();
  const start = new Date(examDetails.startDate).getTime();

  const allowed = await prisma.examGroup.findFirst({
    where: {
      examId: examDetails.id,
      group: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!allowed) {
    throw new ForbiddenError("Student Not Allowed");
  }

  if (start > now) {
    throw new ForbiddenError("Exam Not Started");
  }

  if (!examDetails.isPublished) {
    throw new ForbiddenError("Exam is not Published");
  }

  const attempted = await prisma.examAttempt.findFirst({
    where: {
      examId: examDetails.id,
      studentId: userId,
    },
  });

  if (
    attempted &&
    attempted.status !== "NOT_STARTED" &&
    attempted.status !== "IN_PROGRESS"
  ) {
    throw new ConflictError("Already Attempted");
  }
}

export async function validateAttempt(examId: string, studentId: string) {
  const attempt = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
  });

  if (!attempt) {
    throw new NotFoundError("Attempt not found");
  }

  if (new Date() > attempt.expiresAt) {
    if (attempt.status === "IN_PROGRESS") {
      await prisma.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "AUTO_SUBMITTED",
          submittedAt: new Date(),
        },
      });
    }
    throw new ForbiddenError("Exam time over");
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new ConflictError("Exam not active");
  }

  return attempt;
}

export class SEBError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/**
 * Minimal request information needed to validate a Safe Exam Browser request.
 * Services accept this shape so they do not depend on Express.
 */
export interface SebRequestContext {
  protocol: string;
  host: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

export function toSebRequestContext(req: Request): SebRequestContext {
  return {
    protocol: req.protocol,
    host: req.get("host") ?? "",
    originalUrl: req.originalUrl,
    headers: req.headers,
  };
}

function resolveSebContext(
  input: Request | SebRequestContext,
): SebRequestContext {
  if (typeof (input as Request).get === "function") {
    return toSebRequestContext(input as Request);
  }

  return input as SebRequestContext;
}

function getHeaderValue(
  context: SebRequestContext,
  name: string,
): string {
  const value = context.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

function createSebHash(url: string, key: string): string {
  return crypto
    .createHash("sha256")
    .update(url + key)
    .digest("hex");
}

function compareSebHashes(expectedHash: string, receivedHash: string): boolean {
  if (!receivedHash || expectedHash.length !== receivedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedHash),
    Buffer.from(receivedHash),
  );
}

export function verifySEB(input: Request | SebRequestContext) {
  const context = resolveSebContext(input);
  const { browserExamKeys, configKey } = getSebConfig();

  if (browserExamKeys.length === 0 || !configKey) {
    throw new SEBError("SEB keys are not configured");
  }

  const requestUrl = `${context.protocol}://${context.host}${context.originalUrl}`;

  const requestHash = getHeaderValue(context, "x-safeexambrowser-requesthash");

  const configKeyHash = getHeaderValue(
    context,
    "x-safeexambrowser-configkeyhash",
  );

  if (!requestHash || !configKeyHash) {
    throw new SEBError("Missing SEB headers");
  }

  // const requestHashValid = browserExamKeys.some((key) => {
  //   const expectedRequestHash = createSebHash(requestUrl, key);
  //   return compareSebHashes(expectedRequestHash, requestHash);
  // });

  const expectedConfigKeyHash = createSebHash(requestUrl, configKey);

  const configKeyHashValid = compareSebHashes(
    expectedConfigKeyHash,
    configKeyHash,
  );

  // if (!requestHashValid) {
  //   throw new SEBError("Invalid SEB request hash");
  // }

  if (!configKeyHashValid) {
    throw new SEBError("Invalid SEB config key hash");
  }
}

export function sanitizeSourceCode(code: string): string {
  return (
    code
      // Replace non-breaking spaces with normal spaces
      .replace(/\u00A0/g, " ")

      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, "")

      // Normalize smart quotes (just in case)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")

      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
  );
}

const SEB_CONFIG_KEY = process.env.SEB_CONFIG_KEY || ""; // from your .seb file

export function verifyExamHash(
  url: string,
  receivedHash: string,
  secret = SEB_CONFIG_KEY,
): boolean {
  if (!secret) {
    return false;
  }

  const expectedHash = createSebHash(url, secret);

  return compareSebHashes(expectedHash, receivedHash);
}
