import { Request } from "express";
import { Exam, ExamAttempt } from "../../generated/prisma/client";
import prisma from "./prisma";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";
import crypto from "crypto";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { getSebConfig } from "@/config/ssm";

export async function isStudent(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { globalRoleId: true },
  });

  if (dbUser?.globalRoleId !== GLOBAL_ROLE_IDS.ORG_STUDENT) {
    throw new Error("Forbidden: Student access required");
  }

  return { session };
}

export async function canGiveExam(examDetails: Exam, req: Request) {
  const { session } = await isStudent(req);

  const now = Date.now();
  const start = new Date(examDetails.startDate).getTime();
  const end = new Date(examDetails.endDate).getTime();

  const allowed = await prisma.examGroup.findFirst({
    where: {
      examId: examDetails.id,
      group: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!allowed) {
    throw new Error("Student Not Allowed");
  }

  if (start > now) {
    throw new Error("Exam Not Started");
  }

  if (!examDetails.isPublished) {
    throw new Error("Exam is not Published");
  }

  const attempted = await prisma.examAttempt.findFirst({
    where: {
      examId: examDetails.id,
      studentId: session.user.id,
    },
  });

  if (
    attempted &&
    attempted.status !== "NOT_STARTED" &&
    attempted.status !== "IN_PROGRESS"
  ) {
    throw new Error("Already Attempted");
  }
  return session;
}

export async function validateAttempt(examId: string, studentId: string) {
  const attempt = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
  });

  if (!attempt) {
    throw new Error("Attempt not found");
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
    throw new Error("Exam time over");
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new Error("Exam not active");
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

function getHeaderValue(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];

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

export function verifySEB(req: Request) {
  const { browserExamKey, configKey } = getSebConfig();
  const browserKey = browserExamKey;

  if (!browserKey || !configKey) {
    throw new SEBError("SEB keys are not configured");
  }

  const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const requestHash = getHeaderValue(req, "x-safeexambrowser-requesthash");
  const configKeyHash = getHeaderValue(req, "x-safeexambrowser-configkeyhash");

  if (!requestHash || !configKeyHash) {
    throw new SEBError("Missing SEB headers");
  }

  const expectedRequestHash = createSebHash(requestUrl, browserKey);
  if (!compareSebHashes(expectedRequestHash, requestHash)) {
    throw new SEBError("Invalid SEB request hash");
  }

  const expectedConfigKeyHash = createSebHash(requestUrl, configKey);
  if (!compareSebHashes(expectedConfigKeyHash, configKeyHash)) {
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
