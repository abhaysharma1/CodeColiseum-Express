import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const AI_REVIEW_QUEUE_URL = process.env.SQS_AI_EVAL_QUEUE_URL;
const EXAM_EXECUTION_QUEUE_URL = process.env.SQS_EXAM_QUEUE_URL;
const PRACTICE_EXECUTION_QUEUE_URL = process.env.SQS_PRACTICE_QUEUE_URL;

function ensureSqsConfigured(queueUrl?: string) {
  if (
    !process.env.AWS_REGION ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !queueUrl
  ) {
    const error = new Error("Missing required SQS configuration");
    (error as any).statusCode = 500;
    throw error;
  }
}

async function sendSubmissionMessage(
  queueUrl: string | undefined,
  payload: Record<string, string>,
) {
  ensureSqsConfigured(queueUrl);

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    }),
  );
}

/**
 * Send single submission to SQS
 */
export async function sendMessageToSQS(payload: { selfSubmissionId: string }) {
  await sendSubmissionMessage(AI_REVIEW_QUEUE_URL, {
    selfSubmissionId: payload.selfSubmissionId,
  });
}

export async function sendExamSubmissionToSQS(submissionId: string) {
  await sendSubmissionMessage(EXAM_EXECUTION_QUEUE_URL, { submissionId });
}

export async function sendPracticeSubmissionToSQS(submissionId: string) {
  await sendSubmissionMessage(PRACTICE_EXECUTION_QUEUE_URL, {
    selfSubmissionId: submissionId,
  });
}

/**
 * Batch send (recommended for large exams)
 * Max 10 per batch (SQS limitation)
 */
export async function sendBatchToSQS(submissionIds: string[]) {
  ensureSqsConfigured(AI_REVIEW_QUEUE_URL);

  for (let i = 0; i < submissionIds.length; i += 10) {
    const batch = submissionIds.slice(i, i + 10);

    const command = new SendMessageBatchCommand({
      QueueUrl: AI_REVIEW_QUEUE_URL,
      Entries: batch.map((id, index) => ({
        Id: `${index}`,
        MessageBody: JSON.stringify({ submissionId: id }),
      })),
    });

    const result = await sqsClient.send(command);

    if (result.Failed && result.Failed.length > 0) {
      console.error("Some SQS messages failed:", result.Failed);
      throw new Error("SQS batch failure");
    }
  }
}
