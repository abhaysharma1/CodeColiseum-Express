import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma";
import transporter from "./nodemailer";

const isDev = process.env.NODE_ENV === "development";

const resetPasswordEmailHtml = (user: { name?: string }, url: string) =>
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>Reset your password</title>
  <style>
    body { margin:0; padding:0; background:#0e1420; font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .wrap { width:100%; padding:32px 16px; }
    .container { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border-radius:2px; overflow:hidden; }
    .header { background:#0e1420; padding:28px 28px 24px; text-align:left; border-bottom:3px solid #c15b4a; }
    .eyebrow { color:#c15b4a; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin:0 0 6px; font-weight:700; }
    .wordmark { color:#f5f2ea; font-size:24px; font-weight:700; letter-spacing:1px; margin:0; font-family: Georgia, 'Times New Roman', serif; }
    .wordmark span { color:#c15b4a; }
    .tagline { color:#7d8aa3; font-size:12px; margin:6px 0 0; letter-spacing:0.5px; }
    .body { padding:32px 28px 8px; color:#1b2333; font-family: Georgia, 'Times New Roman', serif; }
    .greeting { font-size:19px; font-weight:700; margin:0 0 14px; color:#0e1420; }
    .p { margin:0 0 20px; color:#3d4759; font-size:15px; line-height:1.6; font-family: Arial, Helvetica, sans-serif; }
    .cta-wrap { text-align:center; padding: 4px 28px 28px; }
    .btn { display:inline-block; padding:14px 36px; background:#0e1420; color:#f5f2ea !important; text-decoration:none; font-family: Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing: 2px; text-transform: uppercase; border-radius:2px; border-bottom: 3px solid #c15b4a; }
    .link-wrap { padding: 0 28px 8px; }
    .link-box { background: #faf5f3; border: 1px solid #ecd8d3; border-radius: 6px; padding: 14px 16px; }
    .link-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 2px; color: #a3644f; text-transform: uppercase; font-weight: 700; margin: 0 0 6px; }
    .link-value { font-family: 'Courier New', ui-monospace, monospace; font-size: 12.5px; color: #17202f; word-break: break-all; margin: 0; }
    .expiry { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #a3644f; background: #faf5f3; border-left: 3px solid #c15b4a; padding: 10px 14px; margin: 20px 28px 8px; line-height:1.5; }
    .muted { font-family: Arial, Helvetica, sans-serif; font-size:12.5px; color:#8a93a6; margin: 20px 28px 28px; line-height:1.5; }
    .divider { height:1px; background:#e8e4d8; margin: 0 28px; }
    .footer { padding:20px 28px; font-family: Arial, Helvetica, sans-serif; font-size:11px; color:#7d8aa3; text-align:center; background:#f7f5f0; letter-spacing:0.5px; }
    @media (max-width:480px){
      .header, .body, .cta-wrap, .link-wrap { padding-left:20px; padding-right:20px; }
      .muted, .expiry { margin-left:20px; margin-right:20px; }
      .divider { margin-left:20px; margin-right:20px; }
    }
  </style>
</head>
<body>
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; color:#fff; line-height:1px; max-width:0;">
    Reset your CodeColiseum password — this link expires in 1 hour.
  </div>

  <div class="wrap">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:2px; overflow:hidden;">
      <tr>
        <td>

          <div class="header" role="banner">
            <p class="eyebrow">Security Checkpoint</p>
            <p class="wordmark">CODE<span>COLISEUM</span></p>
            <p class="tagline">VERIFY · RESET · SECURE</p>
          </div>

          <div class="body">
            <p class="greeting">Hi ${user.name ?? "there"},</p>
            <p class="p">We received a request to reset the password on your CodeColiseum account. Click below to choose a new one.</p>
          </div>

          <div class="cta-wrap">
            <a href=${url} class="btn" target="_blank" rel="noopener">Reset Password</a>
          </div>

          <div class="link-wrap">
            <div class="link-box">
              <p class="link-label">Or paste this link into your browser</p>
              <p class="link-value">${url}</p>
            </div>
          </div>

          <div class="expiry">
            This link expires in <strong>1 hour</strong>. If you didn't request this, no action is needed — your password won't change.
          </div>

          <div class="divider"></div>

          <div class="footer">
            &copy; 2026 CodeColiseum — Sharpen your skills. Compete. Learn.
          </div>

        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  advanced: {
    defaultCookieAttributes: {
      domain: isDev ? undefined : ".codecoliseum.in",
      secure: !isDev,
      sameSite: isDev ? "lax" : "none",
      path: "/",
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: false,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
      await transporter.sendMail({
        to: user.email,
        subject: "Reset your CodeColiseum password",
        text: `Click the link to reset your password: ${resetUrl}`,
        html: resetPasswordEmailHtml(user, resetUrl),
      });
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60, // Cache duration in seconds (5 minutes)
      strategy: "jwt",
    },
  },
  user: {
    additionalFields: {
      isOnboarded: {
        type: "boolean",
        required: false,
        input: true,
        defaultValue: false,
      },
      globalRoleId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  trustedOrigins: [process.env.FRONTEND_URL!], // Explicitly allow localhost for development
});
