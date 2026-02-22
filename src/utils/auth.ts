import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma";
import transporter from "./nodemailer";

const isDev = process.env.NODE_ENV === "development";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  advanced: {
    defaultCookieAttributes: {
      domain: isDev ?  undefined: ".codecoliseum.in" ,
      secure: !isDev,
      sameSite: isDev ? "lax" : "none",
      path: "/",
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 20 * 60, // Cache duration in seconds (5 minutes)
      strategy: "jwt",
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        input: true,
      },
      isOnboarded: {
        type: "boolean",
        required: false,
        input: true,
        defaultValue: false,
      },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }, request) => {
      await transporter.sendMail({
        from: "abhaysharma.mrt@gmail.com",
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${url}`, // plain‑text body
        html: `<!-- Email verification HTML snippet for CodeColiseum -->
          <!doctype html>
          <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width" />
            <title>Verify your email</title>
            <style>
              /* Inline-friendly, minimal styles */
              body { margin:0; padding:0; background:#f6f8fb; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
              .container { width:100%; max-width:600px; margin:28px auto; background:#ffffff; border-radius:12px; box-shadow:0 6px 18px rgba(19,24,31,0.08); overflow:hidden; }
              .header { padding:20px 24px; display:flex; align-items:center; gap:12px; border-bottom:1px solid #eef2f6; }
              .logo { width:40px; height:40px; border-radius:6px; background:#0b69ff; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; }
              .body { padding:28px 24px; color:#111827; line-height:1.45; }
              .h1 { margin:0 0 8px 0; font-size:20px; font-weight:700; color:#0f172a; }
              .p { margin:0 0 18px 0; color:#374151; font-size:15px; }
              .btn { display:inline-block; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600; background:#0b69ff; color:#fff; }
              .muted { color:#6b7280; font-size:13px; margin-top:20px; }
              .footer { padding:16px 24px; font-size:12px; color:#9ca3af; text-align:center; background:#fafafa; }
              @media (max-width:420px){ .body{padding:20px 16px} .header{padding:16px} }
            </style>
          </head>
          <body>
            <!-- preheader (hidden but visible in some inbox previews) -->
            <div style="display:none; max-height:0; overflow:hidden; font-size:1px; color:#fff; line-height:1px; max-width:0;">
              Verify your CodeColiseum account to get started — tap the button inside.
            </div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:transparent;">
              <tr>
                <td align="center">
                  <div class="container" role="article" aria-label="Email verification">
                    <div class="header" role="banner">
                      <div class="logo" aria-hidden="true">CC</div>
                      <div>
                        <div style="font-weight:700; font-size:14px; color:#0f172a;">CodeColiseum</div>
                        <div style="font-size:12px; color:#6b7280;">Verify your email</div>
                      </div>
                    </div>

                    <div class="body">
                      <h1 class="h1">Hi ${user.name},</h1>

                      <p class="p">
                        Thanks for signing up to <strong>CodeColiseum</strong> — your place for coding challenges and live contests.
                        Please confirm your email address so we can activate your account.
                      </p>

                      <p style="text-align:center; margin:22px 0;">
                        <a href=${url} class="btn" target="_blank" rel="noopener">Verify my email</a>
                      </p>

                      <p class="p">
                        If the button doesn't work, copy and paste the following link into your browser:
                        <br />
                        <a href=${url} target="_blank" rel="noopener" style="color:#0b69ff; word-break:break-all;">${url}</a>
                      </p>

                      <p class="muted">
                        This link will expire in 24 hours. If you didn't create an account with CodeColiseum, you can safely ignore this email.
                      </p>
                    </div>

                    <div class="footer">
                      © 2025 CodeColiseum — <span style="color:#6b7280">Sharpen your skills. Compete. Learn.</span>
                    </div>
                  </div>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `, // HTML body
      });
    },
  },
  cookieOptions: {
    domain: ".codecoliseum.in",
  },
  trustedOrigins: [process.env.FRONTEND_URL!], // Explicitly allow localhost for development
});
