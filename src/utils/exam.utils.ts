import { Request } from "express";
import { Exam, ExamAttempt } from "../../generated/prisma/client";
import prisma from "./prisma";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";
import crypto from "crypto";

export async function isStudent(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  if (session.user.role !== "STUDENT") {
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
            studentId: session.user.id,
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
  console.log("---- SEB VERIFY START ----");

  const CONFIG_KEY = process.env.SEB_CONFIG_KEY; // RAW config key from SEB tool
  const receivedHash = req.headers["x-safeexambrowser-configkeyhash"] as string;

  if (!CONFIG_KEY) throw new SEBError("Server missing config key", 500);
  if (!receivedHash) throw new SEBError("Not opened in SEB");

  const proto = req.headers["x-forwarded-proto"] as string || "https";
  const host = req.headers["host"] as string;

  const url = `${proto}://${host}${req.url}`;

  // 🔐 get absolute URL (without fragment)
  // const url = req.nextUrl.origin + req.nextUrl.pathname + req.nextUrl.search;

  console.log("URL:", url);
  console.log("ConfigKey:", CONFIG_KEY);
  console.log("Received:", receivedHash);

  // 🔐 generate expected hash
  const expectedHash = crypto
    .createHash("sha256")
    .update(url + CONFIG_KEY, "utf8")
    .digest("hex");

  console.log("Expected:", expectedHash);

  if (expectedHash !== receivedHash) {
    console.log("❌ SEB HASH INVALID");
    throw new SEBError("Invalid SEB configuration");
  }

  console.log("✅ SEB VERIFIED");
  console.log("---- SEB VERIFY END ----");
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