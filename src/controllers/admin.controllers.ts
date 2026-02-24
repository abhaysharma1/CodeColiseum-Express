import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  expectedComplexity,
  GeneratorPattern,
  GeneratorType,
} from "../../generated/prisma/enums";
import { Prisma } from "../../generated/prisma/client";
import prisma from "@/utils/prisma";
import { auth } from "@/utils/auth";
import axios from "axios";

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

const reconstructJudge0Response = (raw: Judge0Raw): JudgeResponse => ({
  ...raw,
  stdout: decodeBase64(raw.stdout),
  stderr: decodeBase64(raw.stderr),
  compile_output: decodeBase64(raw.compile_output),
  message: decodeBase64(raw.message),
});

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
  languageId: z.number(),
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
  referenceSolution: z.object({ languageId: z.number(), code: z.string() }),
});

const uploadProblemsSchema = z.array(problemSchema).max(2000);

const bulkSignUpSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email address"))
    .min(1, "At least one email is required")
    .max(500, "Cannot sign up more than 500 users at once"),
  role: z.enum(["TEACHER", "STUDENT", "ADMIN"]).optional().default("STUDENT"),
});

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

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      return res.status(404).json({ error: "Couldn't find Problem" });
    }

    // Delete existing driver code
    await prisma.driverCode.deleteMany({
      where: {
        languageId,
        problemId,
      },
    });

    const newCode = await prisma.driverCode.create({
      data: {
        languageId,
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
              languageId: p.referenceSolution.languageId,
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
          language_id: refCode.languageId,
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
      language_id: firstProblem.referenceSolution.languageId,
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

    const { emails, role } = validation.data;

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
            role,
          } as any,
          headers: new Headers(),
        });

        await prisma.user.update({
          where: { email },
          data: { emailVerified: true, isOnboarded: true },
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
