/**
 * Transactional email bodies for admin-issued credentials.
 *
 * These are intentionally kept as HTML template literals: the markup is
 * authored content, and the only dynamic values are the recipient's name,
 * email address, temporary password and the frontend URL.
 */
export interface CredentialsEmailTemplateInput {
  displayName: string;
  email: string;
  password: string;
  frontendUrl: string;
}

export function buildTeacherCredentialsEmail({
  displayName,
  email,
  password,
  frontendUrl,
}: CredentialsEmailTemplateInput): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>Your CodeColiseum Faculty Account</title>
  <style>
    body { margin:0; padding:0; background:#0e1420; font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .wrap { width:100%; padding:32px 16px; }
    .container { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border-radius:2px; overflow:hidden; }
    .header { background:#0e1420; padding:28px 28px 24px; text-align:left; border-bottom:3px solid #8fa1b3; }
    .eyebrow { color:#8fa1b3; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin:0 0 6px; font-weight:700; }
    .wordmark { color:#f5f2ea; font-size:24px; font-weight:700; letter-spacing:1px; margin:0; font-family: Georgia, 'Times New Roman', serif; }
    .wordmark span { color:#8fa1b3; }
    .tagline { color:#7d8aa3; font-size:12px; margin:6px 0 0; letter-spacing:0.5px; }
    .body { padding:32px 28px 8px; color:#1b2333; font-family: Georgia, 'Times New Roman', serif; }
    .greeting { font-size:19px; font-weight:700; margin:0 0 14px; color:#0e1420; }
    .p { margin:0 0 20px; color:#3d4759; font-size:15px; line-height:1.6; font-family: Arial, Helvetica, sans-serif; }
    .ticket-wrap { padding: 4px 28px 28px; }
    .ticket { border: 2px dashed #a6b3c2; border-radius: 6px; background: #f7f9fb; position: relative; }
    .ticket-top { padding: 16px 20px 14px; border-bottom: 1px dashed #a6b3c2; }
    .ticket-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 2px; color: #5c7085; text-transform: uppercase; font-weight: 700; margin: 0 0 4px; }
    .ticket-value { font-family: 'Courier New', ui-monospace, monospace; font-size: 16px; color: #17202f; font-weight: 700; word-break: break-all; margin: 0; }
    .ticket-bottom { padding: 14px 20px 18px; }
    .ticket-id { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 1.5px; color: #7488a0; text-transform: uppercase; }
    .badge { display:inline-block; font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: #33455a; background: #e7ecf1; padding: 4px 10px; border-radius: 3px; margin: 0 0 16px; }
    .cta-wrap { text-align:center; padding: 8px 28px 32px; }
    .btn { display:inline-block; padding:14px 36px; background:#0e1420; color:#f5f2ea !important; text-decoration:none; font-family: Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing: 2px; text-transform: uppercase; border-radius:2px; border-bottom: 3px solid #8fa1b3; }
    .muted { font-family: Arial, Helvetica, sans-serif; font-size:12.5px; color:#8a93a6; margin: 0 28px 28px; line-height:1.5; }
    .divider { height:1px; background:#e8e4d8; margin: 0 28px; }
    .footer { padding:20px 28px; font-family: Arial, Helvetica, sans-serif; font-size:11px; color:#7d8aa3; text-align:center; background:#f7f5f0; letter-spacing:0.5px; }
    @media (max-width:480px){
      .header, .body, .ticket-wrap, .cta-wrap { padding-left:20px; padding-right:20px; }
      .muted { margin-left:20px; margin-right:20px; }
      .divider { margin-left:20px; margin-right:20px; }
    }
  </style>
</head>
<body>
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; color:#fff; line-height:1px; max-width:0;">
    Your CodeColiseum faculty credentials are ready.
  </div>

  <div class="wrap">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:2px; overflow:hidden;">
      <tr>
        <td>

          <div class="header" role="banner">
            <p class="eyebrow">Faculty Access Granted</p>
            <p class="wordmark">CODE<span>COLISEUM</span></p>
            <p class="tagline">GUIDE · ASSESS · MENTOR</p>
          </div>

          <div class="body">
            <span class="badge">Role: Instructor</span>
            <p class="greeting">Hi ${displayName},</p>
            <p class="p">Your CodeColiseum account is ready. As an instructor, you'll have a seat at the judge's bench — set up classes, assign matches, and review your students' standings.</p>
          </div>

          <div class="ticket-wrap">
            <div class="ticket">
              <div class="ticket-top">
                <p class="ticket-label">Email</p>
                <p class="ticket-value">${email}</p>
              </div>
              <div class="ticket-top" style="border-bottom:none;">
                <p class="ticket-label">Temporary password</p>
                <p class="ticket-value">${password}</p>
              </div>
              <div class="ticket-bottom">
                <span class="ticket-id">Faculty credential &nbsp;·&nbsp; Change password after first login</span>
              </div>
            </div>
          </div>

          <div class="cta-wrap">
            <a href="${frontendUrl}/login" class="btn" target="_blank" rel="noopener">Go to Instructor Dashboard</a>
          </div>

          <div class="divider"></div>

          <p class="muted" style="margin-top:20px;">Didn't request this account? You can safely ignore this email — no changes will be made without using the credential above.</p>

          <div class="footer">
            &copy; 2026 CodeColiseum — Sharpen your skills. Compete. Learn.
          </div>

        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function buildStudentCredentialsEmail({
  displayName,
  email,
  password,
  frontendUrl,
}: CredentialsEmailTemplateInput): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>Your CodeColiseum Account</title>
  <style>
    body { margin:0; padding:0; background:#0e1420; font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .wrap { width:100%; padding:32px 16px; }
    .container { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border-radius:2px; overflow:hidden; }
    .header { background:#0e1420; padding:28px 28px 24px; text-align:left; border-bottom:3px solid #d9a441; }
    .eyebrow { color:#d9a441; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin:0 0 6px; font-weight:700; }
    .wordmark { color:#f5f2ea; font-size:24px; font-weight:700; letter-spacing:1px; margin:0; font-family: Georgia, 'Times New Roman', serif; }
    .wordmark span { color:#d9a441; }
    .tagline { color:#7d8aa3; font-size:12px; margin:6px 0 0; letter-spacing:0.5px; }
    .body { padding:32px 28px 8px; color:#1b2333; font-family: Georgia, 'Times New Roman', serif; }
    .greeting { font-size:19px; font-weight:700; margin:0 0 14px; color:#0e1420; }
    .p { margin:0 0 20px; color:#3d4759; font-size:15px; line-height:1.6; font-family: Arial, Helvetica, sans-serif; }
    .ticket-wrap { padding: 4px 28px 28px; }
    .ticket { border: 2px dashed #c9a24b; border-radius: 6px; background: #fdfaf3; position: relative; }
    .ticket-top { padding: 16px 20px 14px; border-bottom: 1px dashed #c9a24b; }
    .ticket-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 2px; color: #a3812f; text-transform: uppercase; font-weight: 700; margin: 0 0 4px; }
    .ticket-value { font-family: 'Courier New', ui-monospace, monospace; font-size: 16px; color: #17202f; font-weight: 700; word-break: break-all; margin: 0; }
    .ticket-bottom { padding: 14px 20px 18px; display: flex; }
    .ticket-id { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 1.5px; color: #b9924f; text-transform: uppercase; }
    .cta-wrap { text-align:center; padding: 8px 28px 32px; }
    .btn { display:inline-block; padding:14px 36px; background:#0e1420; color:#f5f2ea !important; text-decoration:none; font-family: Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing: 2px; text-transform: uppercase; border-radius:2px; border-bottom: 3px solid #d9a441; }
    .muted { font-family: Arial, Helvetica, sans-serif; font-size:12.5px; color:#8a93a6; margin: 0 28px 28px; line-height:1.5; }
    .divider { height:1px; background:#e8e4d8; margin: 0 28px; }
    .footer { padding:20px 28px; font-family: Arial, Helvetica, sans-serif; font-size:11px; color:#7d8aa3; text-align:center; background:#f7f5f0; letter-spacing:0.5px; }
    @media (max-width:480px){
      .header, .body, .ticket-wrap, .cta-wrap { padding-left:20px; padding-right:20px; }
      .muted { margin-left:20px; margin-right:20px; }
      .divider { margin-left:20px; margin-right:20px; }
    }
  </style>
</head>
<body>
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; color:#fff; line-height:1px; max-width:0;">
    Your CodeColiseum credentials are ready — step into the arena.
  </div>

  <div class="wrap">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:2px; overflow:hidden;">
      <tr>
        <td>

          <div class="header" role="banner">
            <p class="eyebrow">Access Granted</p>
            <p class="wordmark">CODE<span>COLISEUM</span></p>
            <p class="tagline">SHARPEN YOUR SKILLS · COMPETE · LEARN</p>
          </div>

          <div class="body">
            <p class="greeting">Hi ${displayName},</p>
            <p class="p">Your account is set up and your seat in the arena is reserved. Below is your competitor credential — everything you need to log in and start your first match.</p>
          </div>

          <div class="ticket-wrap">
            <div class="ticket">
              <div class="ticket-top">
                <p class="ticket-label">Email</p>
                <p class="ticket-value">${email}</p>
              </div>
              <div class="ticket-top" style="border-bottom:none;">
                <p class="ticket-label">Temporary password</p>
                <p class="ticket-value">${password}</p>
              </div>
              <div class="ticket-bottom">
                <span class="ticket-id">Competitor credential &nbsp;·&nbsp; Change password after first login</span>
              </div>
            </div>
          </div>

          <div class="cta-wrap">
            <a href="${frontendUrl}/login" class="btn" target="_blank" rel="noopener">Enter the Arena</a>
          </div>

          <div class="divider"></div>

          <p class="muted" style="margin-top:20px;">Didn't request this account? You can safely ignore this email — no changes will be made without using the credential above.</p>

          <div class="footer">
            &copy; 2026 CodeColiseum — Sharpen your skills. Compete. Learn.
          </div>

        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}
