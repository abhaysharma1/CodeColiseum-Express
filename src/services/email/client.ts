import { SESClient } from "@aws-sdk/client-ses";

let client: SESClient | null = null;

export function getSesClient(): SESClient {
  if (!client) {
    client = new SESClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}
