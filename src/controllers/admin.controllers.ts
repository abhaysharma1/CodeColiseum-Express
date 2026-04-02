import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  expectedComplexity,
  GeneratorPattern,
  GeneratorType,
  ProgrammingLanguage,
} from "../../generated/prisma/enums";
import { Prisma } from "../../generated/prisma/client";
import prisma from "@/utils/prisma";
import { auth } from "@/utils/auth";
import axios from "axios";
import { hashPassword } from "better-auth/crypto";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";

// Types
interface JudgeStatus {
  id: number;
  description: string;
}

interface JudgeResponse {
  stdout: string | null;
  time: string;
  memory: number;
  stderr: string | null;
  token: string;
  compile_output: string | null;
  message: string | null;
  status: JudgeStatus;
  stdin?: string | null;
  expected_output?: string | null;
}

interface Judge0Raw extends Omit<
  JudgeResponse,
  "stdout" | "stderr" | "compile_output" | "message"
> {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
}

// Utility functions
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

const supportedLanguages = ["cpp", "python", "java", "javascript"] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];

const judge0LanguageByKey: Record<SupportedLanguage, number> = {
  cpp: 54,
  python: 71,
  java: 62,
  javascript: 63,
};

const languageByJudge0Id: Record<number, SupportedLanguage> = {
  54: "cpp",
  71: "python",
  62: "java",
  63: "javascript",
};

const normalizeLanguage = (value?: unknown): SupportedLanguage => {
  if (typeof value !== "string") {
    return "cpp";
  }

  const normalized = value.toLowerCase().trim();
  if ((supportedLanguages as readonly string[]).includes(normalized)) {
    return normalized as SupportedLanguage;
  }

  return "cpp";
};

const resolveLanguageFromInput = (input: {
  language?: unknown;
  languageId?: unknown;
}): SupportedLanguage => {
  if (typeof input.language === "string") {
    return normalizeLanguage(input.language);
  }

  if (typeof input.languageId === "number") {
    return languageByJudge0Id[input.languageId] ?? "cpp";
  }

  if (typeof input.languageId === "string") {
    const parsed = Number(input.languageId);
    if (Number.isFinite(parsed)) {
      return languageByJudge0Id[parsed] ?? "cpp";
    }
  }

  return "cpp";
};

const resolveJudge0LanguageId = (input: {
  language?: unknown;
  languageId?: unknown;
}): number => {
  if (typeof input.languageId === "number" && Number.isFinite(input.languageId)) {
    return input.languageId;
  }

  if (typeof input.languageId === "string") {
    const parsed = Number(input.languageId);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const language = resolveLanguageFromInput(input);
  return judge0LanguageByKey[language];
};

const reconstructJudge0Response = (raw: Judge0Raw): JudgeResponse => ({
  ...raw,
  stdout: decodeBase64(raw.stdout),
  stderr: decodeBase64(raw.stderr),
  compile_output: decodeBase64(raw.compile_output),
  message: decodeBase64(raw.message),
});

const languageIdToEnum: Record<number, ProgrammingLanguage> = {
  54: "cpp",
  71: "python",
  62: "java",
  63: "javascript",
};

const judgeLanguageIdByEnum: Record<ProgrammingLanguage, number> = {
  cpp: 54,
  python: 71,
  java: 62,
  javascript: 63,
};

const normalizeLanguage = (languageId?: number): ProgrammingLanguage =>
  languageIdToEnum[languageId ?? -1] ?? "cpp";

const toJudgeLanguageId = (language: ProgrammingLanguage): number =>
  judgeLanguageIdByEnum[language] ?? 54;

// Validation schemas
const complexityCasesSchema = z.object({
  problemId: z.string(),
  expectedComplexity: z.enum(["N", "LOGN", "NLOGN", "N2", "N3", "EXP"]),
  cases: z.array(
    z.object({
      input: z.string(),
      output: z.string(),
    }),
  ),
});

const driverCodeSchema = z.object({
  problemId: z.string(),
  language: z.enum(supportedLanguages).optional(),
  languageId: z.number().int().optional(),
  header: z.string().optional(),
  template: z.string().optional(),
  footer: z.string().optional(),
});

const problemTestGeneratorSchema = z.object({
  problemId: z.string(),
  type: z.enum(["ARRAY", "STRING", "MATRIX"]).default("ARRAY"),
  pattern: z.enum(["RANDOM", "SORTED", "REVERSE", "CONSTANT"]),
  minValue: z.number().int(),
  maxValue: z.number().int(),
  sizes: z.array(z.number().int().positive()).min(3),
  expectedComplexity: z
    .enum(["N", "LOGN", "NLOGN", "N2", "N3", "EXP"])
    .default("N"),
});

const testSchema = z.object({
  input: z.string().max(100_000),
  output: z.string().max(100_000),
});

const problemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional().default("MEDIUM"),
  source: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  publicTests: z.array(testSchema).optional().default([]),
  hiddenTests: z.array(testSchema).optional().default([]),
  referenceSolution: z.object({
    language: z.enum(supportedLanguages).optional(),
    languageId: z.number().int().optional(),
    code: z.string(),
  }),
});

const uploadProblemsSchema = z.array(problemSchema).max(2000);

const problemEditorSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  tags: z.array(z.string()).default([]),
  sections: z.object({
    description: z.string().optional().default(""),
    constraints: z.string().optional().default(""),
    inputFormat: z.string().optional().default(""),
    outputFormat: z.string().optional().default(""),
  }),
  testCases: z.object({
    public: z.array(z.object({
      id: z.string(),
      input: z.string(),
      output: z.string()
    })).default([]),
    hidden: z.array(z.object({
      id: z.string(),
      input: z.string(),
      output: z.string()
    })).default([]),
  }),
  driverCode: z.partialRecord(
    z.enum(["cpp", "python", "java", "javascript"]),
    z.object({
      header: z.string().optional().default(""),
      template: z.string().optional().default(""),
      footer: z.string().optional().default(""),
    })
  ).default({
    cpp: { header: "", template: "", footer: "" },
    python: { header: "", template: "", footer: "" },
    java: { header: "", template: "", footer: "" },
    javascript: { header: "", template: "", footer: "" },
  }),
  solutions: z.array(z.object({
    id: z.string(),
    language: z.enum(["cpp", "python", "java", "javascript"]),
    code: z.string()
  })).default([]),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

const bulkSignUpSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email address"))
    .min(1, "At least one email is required")
    .max(500, "Cannot sign up more than 500 users at once"),
  roleId: z
    .enum([
      GLOBAL_ROLE_IDS.ORG_STUDENT,
      GLOBAL_ROLE_IDS.ORG_TEACHER,
      GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
    ])
    .optional(),
});

const adminSingleSignUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  roleId: z
    .enum([
      GLOBAL_ROLE_IDS.ORG_STUDENT,
      GLOBAL_ROLE_IDS.ORG_TEACHER,
      GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
    ])
    .optional(),
});

const adminAssignRoleSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  roleId: z
    .enum([
      GLOBAL_ROLE_IDS.ORG_STUDENT,
      GLOBAL_ROLE_IDS.ORG_TEACHER,
      GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
    ])
    .optional(),
});

const adminResetPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
  revokeSessions: z.boolean().optional().default(true),
});

function resolveGlobalRoleId(input: {
  roleId?: string;
}): string {
  if (input.roleId) {
    return input.roleId;
  }

  return GLOBAL_ROLE_IDS.ORG_STUDENT;
}

const validateComplexitySchema = z.object({
  problemId: z.string(),
  casesData: z.object({
    expectedComplexity: z.enum(["N", "LOGN", "NLOGN", "N2", "N3", "EXP"]),
    cases: z
      .array(
        z.object({
          input: z.string(),
          output: z.string(),
          size: z.enum(["N", "2N", "4N"]),
        }),
      )
      .length(3),
  }),
});

// Upload Complexity Cases
export const uploadComplexityCases = async (req: Request, res: Response) => {
  try {
    const validation = complexityCasesSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation Error" });
    }

    const {
      problemId,
      expectedComplexity: complexity,
      cases,
    } = validation.data;

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      return res.status(404).json({ error: "Couldn't find problem" });
    }

    // Delete existing complexity cases
    await prisma.complexityTestingCases.deleteMany({
      where: { problemId },
    });

    const result = await prisma.complexityTestingCases.create({
      data: {
        expectedComplexity: complexity as expectedComplexity,
        cases,
        problemId,
      },
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Upload Driver Code
export const uploadDriverCode = async (req: Request, res: Response) => {
  try {
    const validation = driverCodeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation Failed" });
    }

    const { problemId, languageId, header, template, footer } = validation.data;
    const language = normalizeLanguage(languageId);

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      return res.status(404).json({ error: "Couldn't find Problem" });
    }

    // Delete existing driver code
    await prisma.driverCode.deleteMany({
      where: {
        language,
        problemId,
      },
    });

    const newCode = await prisma.driverCode.create({
      data: {
        language,
        header,
        template,
        footer,
        problemId,
      },
    });

    res.status(201).json({ success: true, data: newCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get Problem Test Generator
export const getProblemTestGenerator = async (req: Request, res: Response) => {
  try {
    const { problemId } = req.query;

    if (!problemId || typeof problemId !== "string") {
      return res.status(400).json({ error: "Missing problemId" });
    }

    const generator = await prisma.problemTestGenerator.findUnique({
      where: { problemId },
    });

    res.status(200).json({ generator: generator || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Create/Update Problem Test Generator
export const createUpdateProblemTestGenerator = async (
  req: Request,
  res: Response,
) => {
  try {
    const validation = problemTestGeneratorSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const data = validation.data;

    if (data.minValue >= data.maxValue) {
      return res
        .status(400)
        .json({ error: "minValue must be less than maxValue" });
    }

    for (let i = 1; i < data.sizes.length; i++) {
      if (data.sizes[i] <= data.sizes[i - 1]) {
        return res
          .status(400)
          .json({ error: "sizes must be strictly increasing" });
      }
    }

    const saved = await prisma.problemTestGenerator.upsert({
      where: { problemId: data.problemId },
      create: {
        problemId: data.problemId,
        type: GeneratorType.ARRAY,
        pattern: data.pattern as keyof typeof GeneratorPattern,
        minValue: data.minValue,
        maxValue: data.maxValue,
        sizes: data.sizes,
        expectedComplexity:
          expectedComplexity[
            data.expectedComplexity as keyof typeof expectedComplexity
          ],
      },
      update: {
        pattern: data.pattern as keyof typeof GeneratorPattern,
        minValue: data.minValue,
        maxValue: data.maxValue,
        sizes: data.sizes,
        expectedComplexity:
          expectedComplexity[
            data.expectedComplexity as keyof typeof expectedComplexity
          ],
      },
    });

    res.status(200).json({ generator: saved });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Upload Problems (Bulk)
export const uploadProblems = async (req: Request, res: Response) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: "Empty Request" });
    }

    const validation = uploadProblemsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation Error" });
    }

    const problems = validation.data;

    // Generate starting number
    const currNum = await prisma.problem.aggregate({
      _max: { number: true },
    });

    let nextNum = (currNum._max.number ?? 0) + 1;
    let results: Array<{
      title: string;
      result: "created" | "error";
      number?: number;
      message?: string;
    }> = [];

    for (const p of problems) {
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const problem = await tx.problem.create({
            data: {
              number: nextNum++,
              title: p.title,
              description: p.description,
              difficulty: p.difficulty,
              source: p.source ?? "Unknown",
            },
          });

          if (p.tags) {
            for (const tagName of p.tags) {
              const tag = await tx.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName },
              });

              await tx.problemTag.create({
                data: {
                  problemId: problem.id,
                  tagId: tag.id,
                },
              });
            }
          }

          await tx.testCase.create({
            data: {
              problemId: problem.id,
              cases: p.hiddenTests,
            },
          });

          await tx.runTestCase.create({
            data: {
              problemId: problem.id,
              cases: p.publicTests,
            },
          });

          await tx.referenceSolution.create({
            data: {
              problemId: problem.id,
              language: normalizeLanguage(p.referenceSolution.languageId),
              code: p.referenceSolution.code,
            },
          });
        });

        results.push({
          title: p.title,
          result: "created",
          number: nextNum - 1,
        });
      } catch (error) {
        results.push({
          title: p.title,
          result: "error",
          message: "Couldn't Upload this Problem",
        });
        console.error(error);
      }
    }

    res.status(201).json({ success: true, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Validate Complexity Cases
export const validateComplexityCases = async (req: Request, res: Response) => {
  try {
    const validation = validateComplexitySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation Failed" });
    }

    const { problemId, casesData } = validation.data;

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: { referenceSolutions: true },
    });

    if (!problem) {
      return res.status(400).json({ error: "Couldn't find problem" });
    }

    const refCode = problem.referenceSolutions[0];
    if (!refCode) {
      return res.status(500).json({ error: "Couldn't find reference code" });
    }

    const expectedComplexityValue = casesData.expectedComplexity;
    const cases = casesData.cases;
    let results: JudgeResponse[] = [];

    const JUDGE0_DOMAIN = process.env.JUDGE0_DOMAIN;
    const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

    for (let i = 0; i < cases.length; i++) {
      try {
        const submission = {
          language_id: toJudgeLanguageId(refCode.language),
          source_code: encodeBase64(refCode.code),
          stdin: encodeBase64(cases[i].input),
          expected_output: encodeBase64(cases[i].output),
        };

        const response = await axios.post<Judge0Raw>(
          `${JUDGE0_DOMAIN}/submissions`,
          submission,
          {
            params: {
              base64_encoded: true,
              wait: true,
              fields: "*",
            },
            headers: {
              "X-AUTH_TOKEN": JUDGE0_API_KEY,
            },
          },
        );

        const decoded = reconstructJudge0Response(response.data);
        results[i] = decoded;
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ error: "Please Run the Validation Again" });
      }
    }

    const t1 = Number(results[0].time);
    const t2 = Number(results[1].time);
    const t3 = Number(results[2].time);

    const r1 = t2 / t1;
    const r2 = t3 / t2;

    const { complexity, avgRatio } = classifyComplexity(r1, r2);

    if (complexity === "UNSTABLE" || complexity === "UNKNOWN") {
      return res.status(500).json({ error: "Please Run the Validation Again" });
    }

    const ranges = {
      LOGN: { min: 0, max: 1.3, idx: 0 },
      N: { min: 1.3, max: 1.8, idx: 1 },
      NLOGN: { min: 1.8, max: 2.6, idx: 2 },
      N2: { min: 2.6, max: 4.5, idx: 3 },
      N3: { min: 4.5, max: 7.5, idx: 4 },
      EXP: { min: 7.5, max: Infinity, idx: 5 },
    };

    const item = ranges[complexity as keyof typeof ranges].idx;
    const expCompItem = ranges[expectedComplexityValue].idx;

    if (item <= expCompItem) {
      return res.status(200).json({
        validation: "Successful",
        expectedComplexity: expectedComplexityValue,
        yourComplexity: complexity,
        ratio: avgRatio,
      });
    }

    res.status(422).json({
      validation: "Failed",
      expectedComplexity: expectedComplexityValue,
      yourComplexity: complexity,
      ratio: avgRatio,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Validate Problem
export const validateProblem = async (req: Request, res: Response) => {
  try {
    const validation = uploadProblemsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation Error" });
    }

    const problems = validation.data;
    const firstProblem = problems[0];

    const testCasesBefore = [
      ...firstProblem.publicTests,
      ...firstProblem.hiddenTests,
    ];
    const cases = JSON.parse(JSON.stringify(testCasesBefore));
    const code = firstProblem.referenceSolution.code;

    const submissions = cases.map((item: any) => ({
      language_id: resolveJudge0LanguageId({
        language: firstProblem.referenceSolution.language,
        languageId: firstProblem.referenceSolution.languageId,
      }),
      source_code: encodeBase64(code),
      stdin: encodeBase64(item.input),
      expected_output: encodeBase64(item.output),
    }));

    const JUDGE0_DOMAIN = process.env.JUDGE0_DOMAIN;
    const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

    // Submit all test cases
    const batchResponse = await axios.post(
      `${JUDGE0_DOMAIN}/submissions/batch`,
      { submissions },
      {
        params: {
          base64_encoded: true,
          wait: false,
          fields: "*",
        },
        headers: {
          "X-AUTH_TOKEN": JUDGE0_API_KEY,
        },
      },
    );

    const tokens = (batchResponse.data as any[]).map((item: any) => item.token);

    const pollSubmission = async (token: string): Promise<JudgeResponse> => {
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const statusResponse = await axios.get<Judge0Raw>(
          `${JUDGE0_DOMAIN}/submissions/${token}`,
          {
            params: {
              base64_encoded: true,
              fields: "*",
            },
            headers: {
              "X-AUTH_TOKEN": JUDGE0_API_KEY,
            },
          },
        );

        const result = reconstructJudge0Response(statusResponse.data);

        if (result.status.id > 2) {
          return result;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      throw new Error(`Submission ${token} timed out`);
    };

    const responses = await Promise.all(
      tokens.map((token: string) => pollSubmission(token)),
    );

    res.status(200).json({ responses, cases });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Helper function for complexity classification
function classifyComplexity(r1: number, r2: number) {
  const ranges = {
    LOGN: { min: 0, max: 1.3, idx: 0 },
    N: { min: 1.3, max: 1.8, idx: 1 },
    NLOGN: { min: 1.8, max: 2.6, idx: 2 },
    N2: { min: 2.6, max: 4.5, idx: 3 },
    N3: { min: 4.5, max: 7.5, idx: 4 },
    EXP: { min: 7.5, max: Infinity, idx: 5 },
  };

  if (Math.abs(r1 - r2) / Math.max(r1, r2) > 0.4) {
    return {
      complexity: "UNSTABLE",
      reason: "High runtime variance / noise",
    };
  }

  const avg = (r1 + r2) / 2;

  for (const [name, { min, max }] of Object.entries(ranges)) {
    if (avg >= min && avg < max) {
      return {
        complexity: name,
        avgRatio: avg,
        r1,
        r2,
      };
    }
  }

  return {
    complexity: "UNKNOWN",
    avgRatio: avg,
    r1,
    r2,
  };
}

export const bulkSignUp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validation = bulkSignUpSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: validation.error.flatten(),
      });
    }

    const { emails, roleId } = validation.data;
    const globalRoleId = resolveGlobalRoleId({ roleId });

    const results: Array<{
      email: string;
      result: "created" | "error";
      message?: string;
    }> = [];

    for (const email of emails) {
      const password = email.split("@")[0];
      const name = password;

      try {
        await auth.api.signUpEmail({
          body: {
            email,
            password,
            name,
          } as any,
          headers: new Headers(),
        });

        await prisma.user.update({
          where: { email },
          data: { emailVerified: true, isOnboarded: true, globalRoleId },
        });

        results.push({ email, result: "created" });
      } catch (err: any) {
        results.push({
          email,
          result: "error",
          message: err?.body?.message ?? err?.message ?? "Failed to create account",
        });
      }
    }

    const failed = results.filter((r) => r.result === "error");
    const statusCode = failed.length === 0 ? 201 : failed.length === results.length ? 400 : 207;

    res.status(statusCode).json({ success: failed.length === 0, results });
  } catch (error) {
    next(error);
  }
};

export const adminSingleSignUp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validation = adminSingleSignUpSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: validation.error.flatten(),
      });
    }

    const { name, email, password, roleId } = validation.data;
    const globalRoleId = resolveGlobalRoleId({ roleId });
    const normalizedEmail = email.toLowerCase();

    try {
      await auth.api.signUpEmail({
        body: {
          email: normalizedEmail,
          password,
          name,
        } as any,
        headers: new Headers(),
      });
    } catch (error: any) {
      const message =
        error?.body?.message ??
        error?.message ??
        "Failed to create account";

      if (/already exists|another email/i.test(String(message))) {
        return res.status(409).json({
          error: "User already exists",
          message,
        });
      }

      return res.status(400).json({
        error: "Failed to create account",
        message,
      });
    }

    const createdUser = await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        emailVerified: true,
        isOnboarded: true,
        globalRoleId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        globalRoleId: true,
      },
    });

    return res.status(201).json({
      success: true,
      user: createdUser,
    });
  } catch (error) {
    next(error);
  }
};

export const assignUserRoleByEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validation = adminAssignRoleSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: validation.error.flatten(),
      });
    }

    const { email, roleId } = validation.data;
    const normalizedEmail = email.toLowerCase();
    const globalRoleId = resolveGlobalRoleId({ roleId });

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        globalRoleId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        globalRoleId: true,
      },
    });

    return res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

export const resetUserPasswordByEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validation = adminResetPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: validation.error.flatten(),
      });
    }

    const { email, newPassword, revokeSessions } = validation.data;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const hashedPassword = await hashPassword(newPassword);

    const credentialAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        providerId: "credential",
      },
      select: {
        id: true,
      },
    });

    if (credentialAccount) {
      await prisma.account.update({
        where: { id: credentialAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hashedPassword,
        },
      });
    }

    if (revokeSessions) {
      await prisma.session.deleteMany({
        where: { userId: user.id },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      email: user.email,
      sessionsRevoked: revokeSessions,
    });
  } catch (error) {
    next(error);
  }
};

export const getProblemForEditor = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      return res.status(400).json({ message: "Problem id is required" });
    }

    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        runTestCase: true,
        testCase: true,
        driverCode: true,
        referenceSolutions: true,
      }
    });

    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    // Attempt to reconstruct sections from markdown
    // Format assumption: ## Description\n\n...\n\n## Constraints\n\n...\n\n## Input Format\n\n...\n\n## Output Format\n\n...
    let description = problem.description;
    let constraints = "";
    let inputFormat = "";
    let outputFormat = "";

    const descSplit = description.split(/## Constraints/i);
    if (descSplit.length > 1) {
      description = descSplit[0].replace(/## Description/i, "").trim();
      const afterDesc = ("## Constraints\n\n" + descSplit[1]);
      
      const constraintSplit = afterDesc.split(/## Input Format/i);
      if (constraintSplit.length > 1) {
        constraints = constraintSplit[0].replace(/## Constraints/i, "").trim();
        const afterConstr = ("## Input Format\n\n" + constraintSplit[1]);
        
        const inputSplit = afterConstr.split(/## Output Format/i);
        if (inputSplit.length > 1) {
          inputFormat = inputSplit[0].replace(/## Input Format/i, "").trim();
          outputFormat = inputSplit[1].replace(/## Output Format/i, "").trim();
        } else {
          inputFormat = afterConstr.replace(/## Input Format/i, "").trim();
        }
      } else {
        constraints = afterDesc.replace(/## Constraints/i, "").trim();
      }
    }

    // Format driverCode mapping
    const driverCodeResult: any = {};
    problem.driverCode.forEach((dc) => {
      driverCodeResult[dc.language.toLowerCase()] = {
        header: dc.header || "",
        template: dc.template || "",
        footer: dc.footer || ""
      };
    });

    // Handle testcases safely
    const publicTests = problem.runTestCase?.cases ? (problem.runTestCase.cases as any[]) : [];
    const hiddenTests = problem.testCase?.cases ? (problem.testCase.cases as any[]) : [];

    const result = {
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      tags: problem.tags.map((t) => t.tag.name),
      sections: {
        description,
        constraints,
        inputFormat,
        outputFormat
      },
      testCases: {
        public: publicTests.map((t: any, idx) => ({ id: t.id || `pub-${idx}`, input: t.input, output: t.output })),
        hidden: hiddenTests.map((t: any, idx) => ({ id: t.id || `hid-${idx}`, input: t.input, output: t.output }))
      },
      driverCode: driverCodeResult,
      solutions: problem.referenceSolutions.map((rs) => ({ id: rs.id, language: rs.language, code: rs.code })),
      status: problem.isPublished ? "PUBLISHED" : "DRAFT"
    };

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const upsertProblem = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const bodyResult = problemEditorSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ errors: bodyResult.error.format() });
    }

    const val = bodyResult.data;

    const fullDescription = `## Description\n\n${val.sections.description.trim()}\n\n## Constraints\n\n${val.sections.constraints.trim()}\n\n## Input Format\n\n${val.sections.inputFormat.trim()}\n\n## Output Format\n\n${val.sections.outputFormat.trim()}`;

    const isPublished = val.status === "PUBLISHED";

    // Handle tags creation in parallel
    await prisma.tag.createMany({
      data: val.tags.map((t) => ({ name: t })),
      skipDuplicates: true,
    });
    
    const dbTags = await prisma.tag.findMany({
      where: { name: { in: val.tags } },
    });

    const publicCasesJson = val.testCases.public.map((t, idx) => ({ id: t.id || `pub-${idx}`, input: t.input, output: t.output }));
    const hiddenCasesJson = val.testCases.hidden.map((t, idx) => ({ id: t.id || `hid-${idx}`, input: t.input, output: t.output }));

    const problemData = {
      title: val.title,
      description: fullDescription,
      difficulty: val.difficulty as any,
      isPublished,
      runTestCase: {
        create: { cases: publicCasesJson },
      },
      testCase: {
        create: { cases: hiddenCasesJson },
      },
    };

    let problem;
    if (id) {
       // Update path
      const existingProblem = await prisma.problem.findUnique({ where: { id } });
       if (!existingProblem) {
         return res.status(404).json({ message: "Problem not found" });
       }
       
       await prisma.$transaction(async (tx) => {
          // Clear associations before update
          await tx.problemTag.deleteMany({ where: { problemId: id } });
          await tx.runTestCase.deleteMany({ where: { problemId: id } });
          await tx.testCase.deleteMany({ where: { problemId: id } });
          await tx.driverCode.deleteMany({ where: { problemId: id } });
          await tx.referenceSolution.deleteMany({ where: { problemId: id } });

          problem = await tx.problem.update({
            where: { id },
            data: {
              title: val.title,
              description: fullDescription,
              difficulty: val.difficulty as any,
              isPublished,
              tags: {
                create: dbTags.map(t => ({ tagId: t.id }))
              },
              runTestCase: { create: { cases: publicCasesJson } },
              testCase: { create: { cases: hiddenCasesJson } },
              driverCode: {
                 create: Object.entries(val.driverCode).map(([lang, codes]) => ({
                    language: lang as any,
                    header: codes.header,
                    template: codes.template,
                    footer: codes.footer
                 }))
              },
              referenceSolutions: {
                 create: val.solutions.map(sol => ({
                    language: sol.language as any,
                    code: sol.code
                 }))
              }
            }
          });
       });
    } else {
       // Create path
       const maxNumberMatch = await prisma.problem.findFirst({
         orderBy: { number: 'desc' }
       });
       const nextNumber = (maxNumberMatch?.number || 0) + 1;

       problem = await prisma.problem.create({
         data: {
           title: val.title,
           description: fullDescription,
           difficulty: val.difficulty as any,
           number: nextNumber,
           isPublished,
           tags: {
             create: dbTags.map(t => ({ tagId: t.id }))
           },
           runTestCase: { create: { cases: publicCasesJson } },
           testCase: { create: { cases: hiddenCasesJson } },
           driverCode: {
              create: Object.entries(val.driverCode).map(([lang, codes]) => ({
                 language: lang as any,
                 header: codes.header,
                 template: codes.template,
                 footer: codes.footer
              }))
           },
           referenceSolutions: {
              create: val.solutions.map(sol => ({
                 language: sol.language as any,
                 code: sol.code
              }))
           }
         }
       });
    }

    return res.status(200).json({ id: problem?.id, message: "Problem saved successfully" });
  } catch (error) {
    next(error);
  }
};

export const getProblemsForAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const problems = await prisma.problem.findMany({
      select: {
        id: true,
        title: true,
        isPublished: true,
        difficulty: true,
      },
      orderBy: { number: 'asc' },
    });

    res.status(200).json({ problems });
  } catch (error) {
    next(error);
  }
};

