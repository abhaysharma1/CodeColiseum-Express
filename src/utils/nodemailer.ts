import { sendEmail } from "@/services/email";

const defaultFrom = process.env.EMAIL_FROM ?? "noreply@codecoliseum.com";

interface SendMailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export const transporter = {
  sendMail: async (options: SendMailOptions): Promise<void> => {
    const { from: _from, to, subject, text, html } = options;
    const result = await sendEmail({
      to,
      subject,
      text,
      html: html ?? text ?? "",
    });
    if (!result.success) {
      throw new Error(
        result.errorCode
          ? `SES Error [${result.errorCode}]: ${result.error}`
          : `Failed to send email: ${result.error}`,
      );
    }
  },
};

export default transporter;
