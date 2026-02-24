import crypto from "crypto";
import { CloudTasksClient } from "@google-cloud/tasks";
import prisma from "@/utils/prisma";

const tasksClient = new CloudTasksClient();

// ===== Required ENV =====
// GCP_PROJECT
// GCP_LOCATION
// AI_REVIEW_QUEUE_NAME
// AI_WORKER_URL
// AI_TASK_SERVICE_ACCOUNT_EMAIL

const project = process.env.GCP_PROJECT!;
const location = process.env.GCP_LOCATION!;
const queueName = process.env.AI_REVIEW_QUEUE_NAME!;
const workerUrl = process.env.AI_WORKER_URL!;
const serviceAccountEmail = process.env.AI_TASK_SERVICE_ACCOUNT_EMAIL!;

const queuePath = tasksClient.queuePath(project, location, queueName);

interface EnqueuePracticeAIReviewParams {
  userId: string;
  problemId: string;
  code: string;
  language: string;
}

export async function enqueuePracticeAIReview({
  userId,
  problemId,
  code,
  language,
}: EnqueuePracticeAIReviewParams): Promise<{ jobId: string }> {
  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!problemId || !code || !language) {
    throw new Error("problemId, code and language are required");
  }

  if (code.length > 12000) {
    throw new Error("Code too large for AI review");
  }

  // Fetch minimal problem data
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      description: true,
    },
  });

  if (!problem) {
    throw new Error("Problem not found");
  }

  const jobId = crypto.randomUUID();

  const payload = {
    jobId,
    userId,
    problem,
    code,
    language,
  };

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: workerUrl,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail,
        audience: `${workerUrl}/process-ai-review`,
      },
    },
  };

  try {
    await tasksClient.createTask({
      parent: queuePath,
      task,
    });
  } catch (error) {
    console.log(error)
    throw new Error("Couldn't create Task");
  }

  return { jobId };
}
