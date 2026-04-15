import { Request } from "express";
import { Exam, ExamAttempt } from "../../generated/prisma/client";
import prisma from "./prisma";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";
import crypto from "crypto";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";

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

export function verifySEB(req: Request) {
  const configKey = process.env.SEB_CONFIG_KEY_HASH;
  const browserKey = process.env.SEB_BROWSER_KEY;

  const receivedConfigHash = req.headers[
    "x-safeexambrowser-configkeyhash"
  ] as string;

  const receivedBrowserHash =
    (req.headers["x-safeexambrowser-browserexamkeyhash"] as string) ||
    (req.headers["x-safeexambrowser-requesthash"] as string);

  console.log("Set Config Hash: ", configKey, "\n");
  console.log("Received Config Hash: ", receivedConfigHash, "\n");
  console.log("Set Browser Hash: ", browserKey, "\n");
  console.log("Received Browser Hash: ", receivedBrowserHash, "\n");

  console.log("HEADERS: \n", req.headers);

  const userAgent = (req.headers["user-agent"] as string) || "";

  if (!configKey) throw new SEBError("Server missing config key", 500);
  if (!browserKey) throw new SEBError("Server missing browser key", 500);
  if (!receivedConfigHash || !receivedBrowserHash) {
    throw new SEBError("Not opened in SEB");
  }

  if (!/safeexambrowser|\bseb\b/i.test(userAgent)) {
    throw new SEBError("Invalid SEB user agent");
  }

  const proto = ((req.headers["x-forwarded-proto"] as string) || "https")
    .split(",")[0]
    .trim();
  const host = (
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    ""
  )
    .split(",")[0]
    .trim();
  const pathWithQuery = req.originalUrl || req.url;

  if (!host) {
    throw new SEBError("Invalid host header", 400);
  }

  const url = `${proto}://${host}${pathWithQuery}`;

  const expectedConfigHash = crypto
    .createHash("sha256")
    .update(url + configKey, "utf8")
    .digest("hex");

  const expectedBrowserHash = crypto
    .createHash("sha256")
    .update(url + browserKey, "utf8")
    .digest("hex");

  if (expectedConfigHash !== receivedConfigHash) {
    throw new SEBError("Invalid SEB configuration");
  }

  if (expectedBrowserHash !== receivedBrowserHash) {
    throw new SEBError("Invalid SEB browser key");
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
