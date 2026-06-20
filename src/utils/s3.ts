import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_ENDPOINT ? true : undefined,
});

const BUCKET = process.env.PERFORMANCE_TEST_CASES_BUCKET;

export function getBucket(): string {
  if (!BUCKET) {
    throw new Error("PERFORMANCE_TEST_CASES_BUCKET is not configured");
  }
  return BUCKET;
}

export async function uploadToS3(key: string, body: Buffer | string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
  });
  await s3Client.send(command);
}

export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  await s3Client.send(command);
}

export async function downloadFromS3(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  const response = await s3Client.send(command);
  return await response.Body!.transformToString("utf-8");
}
