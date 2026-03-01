import { Request } from "express";
import prisma from "../utils/prisma";
import {
  canGiveExam,
  validateAttempt,
  verifySEB,
  SEBError,
  sanitizeSourceCode,
} from "../utils/exam.utils";
import { SubmissionStatus } from "../../generated/prisma/enums";

// Base64 utility functions
const encodeBase64 = (value?: string | null): string | null =>
  value ? Buffer.from(value, "utf8").toString("base64") : null;

const decodeBase64 = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
};

// Language mappings
const languages = [
  { id: 50, name: "C" },
  { id: 54, name: "C++" },
  { id: 51, name: "C#" },
  { id: 60, name: "Go" },
  { id: 62, name: "Java" },
  { id: 63, name: "JavaScript" },
  { id: 71, name: "Python" },
  { id: 73, name: "Rust" },
  { id: 74, name: "TypeScript" },
];

// Map Judge0 status IDs to status strings
function mapJudge0Status(statusId: number): string {
  switch (statusId) {
    case 3:
      return "ACCEPTED";
    case 4:
      return "WRONG_ANSWER";
    case 5:
      return "TIME_LIMIT_EXCEEDED";
    case 6:
      return "COMPILATION_ERROR";
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
      return "RUNTIME_ERROR";
    default:
      return "INTERNAL_ERROR";
  }
}

// Complexity analysis functions
const ranges = {
  LOGN: { min: 0, max: 1.3, idx: 0 },
  N: { min: 1.3, max: 1.8, idx: 1 },
  NLOGN: { min: 1.8, max: 2.6, idx: 2 },
  N2: { min: 2.6, max: 4.5, idx: 3 },
  N3: { min: 4.5, max: 7.5, idx: 4 },
  EXP: { min: 7.5, max: Infinity, idx: 5 },
};

function classifyComplexity(r1: number, r2: number) {
  if (Math.abs(r1 - r2) / Math.max(r1, r2) > 0.4) {
    return { complexity: "EXP" };
  }

  const avg = (r1 + r2) / 2;

  for (const [k, v] of Object.entries(ranges)) {
    if (avg >= v.min && avg < v.max) {
      return { complexity: k as keyof typeof ranges };
    }
  }

  return { complexity: "EXP" };
}

function generateArray(
  size: number,
  min: number,
  max: number,
  pattern: string,
): number[] {
  let arr = Array.from(
    { length: size },
    () => Math.floor(Math.random() * (max - min + 1)) + min,
  );

  if (pattern === "SORTED") arr.sort((a, b) => a - b);
  if (pattern === "REVERSE") arr.sort((a, b) => b - a);
  if (pattern === "CONSTANT") arr.fill(arr[0]);

  return arr;
}

// Interface for submit code request
export interface SubmitCodeRequest {
  examId: string;
  problemId: string;
  sourceCode: string;
  languageId: number;
}

// Interface for submit code response
export interface SubmitCodeResponse {
  success: boolean;
  submissionId: string;
  status: SubmissionStatus;
  score: number;
  passedCount: number;
  totalCount: number;
  results: Array<{
    status: string;
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    time: string;
    memory: number;
  }>;
  totalTimeTaken: number;
  totalMemoryTaken: number;
  yourTimeComplexity?: string | null;
  expectedTimeComplexity?: string | null;
}

// Main service function
export async function submitCodeService(
  req: Request,
  { examId, problemId, sourceCode, languageId }: SubmitCodeRequest,
): Promise<SubmitCodeResponse> {
  const language = languages.find((item) => item.id == languageId)?.name;
  const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;
  const JUDGE0_DOMAIN = process.env.JUDGE0_DOMAIN;

  if (!examId || !problemId || !sourceCode || !languageId) {
    throw new Error("Missing required fields");
  }

  if (!language) {
    throw new Error("Unsupported language");
  }

  const examDetails = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!examDetails) {
    throw new Error("Exam Not Found");
  }

  if (examDetails.sebEnabled) {
    verifySEB(req);
  }

  const session = await canGiveExam(examDetails, req);
  await validateAttempt(examDetails.id, session.user.id);

  // Get test cases
  const casesData = await prisma.testCase.findUnique({
    where: { problemId },
  });

  if (!casesData) {
    throw new Error("Test cases not found for this problem");
  }

  let cases;
  if (typeof casesData.cases === "string") {
    cases = JSON.parse(casesData.cases);
  } else {
    cases = JSON.parse(JSON.stringify(casesData.cases));
  }

  if (!cases || !Array.isArray(cases) || cases.length === 0) {
    throw new Error("Test cases not found for this problem");
  }

  // Get driver code for final code assembly
  const driver = await prisma.driverCode.findUnique({
    where: {
      languageId_problemId: {
        languageId,
        problemId,
      },
    },
  });

  const finalCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${sourceCode}\n${driver?.footer ?? ""}`,
  );

  const submissions = cases.map((item: any) => ({
    language_id: languageId,
    source_code: encodeBase64(finalCode),
    stdin: encodeBase64(item.input),
    expected_output: encodeBase64(item.output),
  }));

  // Submit all test cases to Judge0
  const batchResponse = await fetch(
    `${JUDGE0_DOMAIN}/submissions/batch?base64_encoded=true&wait=false&fields=*`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH_TOKEN": JUDGE0_API_KEY!,
      },
      body: JSON.stringify({ submissions }),
    },
  );

  if (!batchResponse.ok) {
    throw new Error("Failed to submit to Judge0");
  }

  const batchData = await batchResponse.json();
  const tokens = (batchData as any[]).map((item: any) => item.token);

  // Poll for results
  const pollSubmission = async (token: string) => {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(
        `${JUDGE0_DOMAIN}/submissions/${token}?base64_encoded=true&fields=*`,
        {
          headers: { "X-AUTH_TOKEN": JUDGE0_API_KEY! },
        },
      );

      if (!statusResponse.ok) {
        throw new Error(`Failed to get submission status for token ${token}`);
      }

      const result = await statusResponse.json();

      if (result.status.id > 2) {
        return result;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      attempts++;
    }
    throw new Error(`Submission ${token} timed out`);
  };

  const responses = await Promise.all(
    tokens.map((token) => pollSubmission(token)),
  );

  let totalTimeTaken = 0;
  let totalMemoryTaken = 0;

  for (const p of responses) {
    totalTimeTaken += Number(p.time);
    totalMemoryTaken += Number(p.memory);
  }

  const finalResults = responses.map((res: any) => ({
    status: mapJudge0Status(res.status.id),
    stdout: decodeBase64(res.stdout),
    stderr: decodeBase64(res.stderr),
    compile_output: decodeBase64(res.compile_output),
    time: res.time,
    memory: res.memory,
  }));

  // Calculate overall status and score
  const passedCount = finalResults.filter(
    (r: any) => r.status === "ACCEPTED",
  ).length;
  const totalCount = finalResults.length;
  let score = Math.round((passedCount / totalCount) * 100);

  let overallStatus: SubmissionStatus;

  if (finalResults.some((r: any) => r.status === "COMPILATION_ERROR")) {
    overallStatus = SubmissionStatus.COMPILE_ERROR;
  } else if (
    finalResults.some((r: any) => r.status === "TIME_LIMIT_EXCEEDED")
  ) {
    overallStatus = SubmissionStatus.TIME_LIMIT;
  } else if (finalResults.some((r: any) => r.status === "RUNTIME_ERROR")) {
    overallStatus = SubmissionStatus.RUNTIME_ERROR;
  } else if (passedCount === totalCount) {
    overallStatus = SubmissionStatus.ACCEPTED;
  } else if (passedCount > 0) {
    overallStatus = SubmissionStatus.PARTIAL;
  } else {
    overallStatus = SubmissionStatus.WRONG_ANSWER;
  }

  let yourTimeComplexity = null;
  let expectedTimeComplexity = null;

  // Complexity testing (only if all functional tests passed)
  if (passedCount === totalCount) {
    const complexityCasesGenerator =
      await prisma.problemTestGenerator.findUnique({
        where: { problemId },
      });

    if (complexityCasesGenerator && complexityCasesGenerator.type === "ARRAY") {
      let complexityCases: { input: string }[] = [];

      for (const size of complexityCasesGenerator.sizes) {
        const arr = generateArray(
          size,
          complexityCasesGenerator.minValue,
          complexityCasesGenerator.maxValue,
          complexityCasesGenerator.pattern,
        );

        const input = `${size}\n${arr.join(" ")}`;
        complexityCases.push({ input });
      }

      if (complexityCases.length >= 3) {
        const times: number[] = [];

        // Run complexity tests
        for (const c of complexityCases) {
          const res = await fetch(
            `${JUDGE0_DOMAIN}/submissions?base64_encoded=true&wait=true`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-AUTH_TOKEN": JUDGE0_API_KEY!,
              },
              body: JSON.stringify({
                language_id: languageId,
                source_code: encodeBase64(finalCode),
                stdin: encodeBase64(c.input),
              }),
            },
          );

          if (!res.ok) {
            throw new Error("Failed to submit complexity test");
          }

          const data = await res.json();
          const t = Number(data.time);
          times.push(Number.isFinite(t) ? t : 0);
        }

        if (times.every((t) => t > 0)) {
          const r1 = times[1] / times[0];
          const r2 = times[2] / times[1];

          const { complexity } = classifyComplexity(r1, r2);

          yourTimeComplexity = complexity;
          expectedTimeComplexity = complexityCasesGenerator.expectedComplexity;

          // Check if complexity is acceptable
          const expectedKey =
            (complexityCasesGenerator.expectedComplexity as keyof typeof ranges) ??
            ("EXP" as keyof typeof ranges);
          const curr = ranges[complexity as keyof typeof ranges].idx;
          const exp = ranges[expectedKey].idx;

          if (curr > exp) {
            overallStatus = SubmissionStatus.WRONG_ANSWER;
            score = Math.round(score * 0.5); // Penalty for bad scaling
          }
        }
      }
    }
  }

  // Get current attempt
  const examAttempt = await prisma.examAttempt.findUnique({
    where: {
      examId_studentId: {
        examId: examDetails.id,
        studentId: session.user.id,
      },
    },
  });

  if (!examAttempt) {
    throw new Error("Exam attempt not found");
  }

  // Handle final submission logic
  const prevFinalSubmission = await prisma.submission.findFirst({
    where: {
      userId: session.user.id,
      isFinal: true,
      problemId,
      examId,
      attemptId: examAttempt.id,
    },
  });

  let isCurrentSubmissionFinal = false;

  if (
    !prevFinalSubmission ||
    prevFinalSubmission.passedTestcases <= passedCount
  ) {
    isCurrentSubmissionFinal = true;
    if (prevFinalSubmission) {
      await prisma.submission.update({
        where: { id: prevFinalSubmission.id },
        data: { isFinal: false },
      });
    }
  }

  // Create submission record
  const submission = await prisma.submission.create({
    data: {
      attemptId: examAttempt.id,
      problemId,
      language: language!,
      sourceCode,
      status: overallStatus,
      totalTestcases: totalCount,
      passedTestcases: passedCount,
      executionTime: totalTimeTaken,
      memory: totalMemoryTaken,
      examId,
      userId: session.user.id,
      isFinal: isCurrentSubmissionFinal,
    },
  });

  // ...existing code...

  const groups = await prisma.group.findMany({
    where: {
      members: {
        some: {
          studentId: session.user.id,
        },
      },
      examGroups: {
        some: {
          examId: examDetails.id,
        },
      },
    },
  });

  // Update stats for each group the student belongs to
  for (const group of groups) {
    // Fetch existing StudentProblemStats to detect first attempt / first solve
    const existingStudentProblemStats =
      await prisma.studentProblemStats.findUnique({
        where: {
          studentId_problemId_groupId: {
            studentId: session.user.id,
            problemId,
            groupId: group.id,
          },
        },
      });

    const isFirstAttempt = !existingStudentProblemStats;
    const isFirstSolve =
      overallStatus === SubmissionStatus.ACCEPTED &&
      !existingStudentProblemStats?.solved;

    // 1. Upsert StudentProblemStats
    await prisma.studentProblemStats.upsert({
      where: {
        studentId_problemId_groupId: {
          studentId: session.user.id,
          problemId,
          groupId: group.id,
        },
      },
      create: {
        studentId: session.user.id,
        problemId,
        groupId: group.id,
        attempts: 1,
        solved: overallStatus === SubmissionStatus.ACCEPTED,
      },
      update: {
        attempts: { increment: 1 },
        // Only flip solved to true, never back to false
        ...(isFirstSolve && { solved: true }),
      },
    });

    // 2. Upsert GroupProblemStats
    const existingGroupStats = await prisma.groupProblemStats.findUnique({
      where: {
        groupId_problemId: {
          groupId: group.id,
          problemId,
        },
      },
    });

    if (!existingGroupStats) {
      await prisma.groupProblemStats.create({
        data: {
          groupId: group.id,
          problemId,
          totalStudents: 0, // managed separately (group member count)
          attemptedCount: 1,
          acceptedCount: isFirstSolve ? 1 : 0,
          totalAttempts: 1,
          avgRuntime: totalTimeTaken,
          avgMemory: totalMemoryTaken,
        },
      });
    } else {
      const newTotalAttempts = existingGroupStats.totalAttempts + 1;
      const newAvgRuntime =
        (existingGroupStats.avgRuntime * existingGroupStats.totalAttempts +
          totalTimeTaken) /
        newTotalAttempts;
      const newAvgMemory =
        (existingGroupStats.avgMemory * existingGroupStats.totalAttempts +
          totalMemoryTaken) /
        newTotalAttempts;

      await prisma.groupProblemStats.update({
        where: {
          groupId_problemId: {
            groupId: group.id,
            problemId,
          },
        },
        data: {
          totalAttempts: { increment: 1 },
          ...(isFirstAttempt && { attemptedCount: { increment: 1 } }),
          ...(isFirstSolve && { acceptedCount: { increment: 1 } }),
          avgRuntime: newAvgRuntime,
          avgMemory: newAvgMemory,
        },
      });
    }

    // 3. Upsert StudentOverallStats (attempt tracking only — scores updated at exam result time)
    await prisma.studentOverallStats.upsert({
      where: {
        groupId_studentId: {
          groupId: group.id,
          studentId: session.user.id,
        },
      },
      create: {
        groupId: group.id,
        studentId: session.user.id,
        totalScore: 0,
        totalExams: 0,
        avgScore: 0,
        totalAttempts: 1,
      },
      update: {
        totalAttempts: { increment: 1 },
      },
    });
  }


  return {
    success: true,
    submissionId: submission.id,
    status: overallStatus,
    score: score,
    passedCount: passedCount,
    totalCount: totalCount,
    results: finalResults,
    totalTimeTaken,
    totalMemoryTaken,
    yourTimeComplexity,
    expectedTimeComplexity,
  };
}
