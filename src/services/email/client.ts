import { SESClient } from "@aws-sdk/client-ses";

let client: SESClient | null = null;

export function getSesClient(): SESClient {
  if (!client) {
    client = new SESClient({
      region: process.env.AWS_REGION ?? "ap-south-1",
    });
  }
  return client;
}
