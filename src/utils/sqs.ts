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

const QUEUE_URL = process.env.SQS_QUEUE_URL;

/**
 * Send single submission to SQS
 */
export async function sendMessageToSQS(payload: { submissionId: string }) {
  if (
    !process.env.AWS_REGION ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !process.env.SQS_QUEUE_URL
  ) {
    console.log("Missing SQS Variables");
  }
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(payload),
    }),
  );
}

/**
 * Batch send (recommended for large exams)
 * Max 10 per batch (SQS limitation)
 */
export async function sendBatchToSQS(submissionIds: string[]) {
  for (let i = 0; i < submissionIds.length; i += 10) {
    const batch = submissionIds.slice(i, i + 10);

    const command = new SendMessageBatchCommand({
      QueueUrl: QUEUE_URL,
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
