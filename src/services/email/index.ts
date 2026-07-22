import { SendEmailCommand, SESServiceException } from "@aws-sdk/client-ses";
import { getSesClient } from "./client";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

const fromAddress = (): string =>
  process.env.EMAIL_FROM ?? "noreply@codecoliseum.in";

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams): Promise<SendEmailResult> {
  const recipients = Array.isArray(to) ? to : [to];

  const command = new SendEmailCommand({
    Source: fromAddress(),
    Destination: {
      ToAddresses: recipients,
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: html,
          Charset: "UTF-8",
        },
        ...(text
          ? {
              Text: {
                Data: text,
                Charset: "UTF-8",
              },
            }
          : {}),
      },
    },
  });

  try {
    const response = await getSesClient().send(command);
    console.log(
      `[SES] Email sent successfully — to: ${recipients.join(", ")}, subject: "${subject}", messageId: ${response.MessageId}`,
    );
    return { success: true, messageId: response.MessageId };
  } catch (err: unknown) {
    if (err instanceof SESServiceException) {
      console.error(
        `[SES] Failed to send email — to: ${recipients.join(", ")}, subject: "${subject}", error: ${err.name}, message: ${err.message}`,
      );
      return {
        success: false,
        error: err.message,
        errorCode: err.name,
      };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[SES] Failed to send email — to: ${recipients.join(", ")}, subject: "${subject}", error: ${message}`,
    );
    return { success: false, error: message };
  }
}
