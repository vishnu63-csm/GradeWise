const nodemailer = require("nodemailer");

/**
 * Checks and returns Nodemailer transport if SMTP is configured.
 */
function getTransporter() {
  const mailHost = process.env.MAIL_HOST || process.env.SMTP_HOST;
  const mailPort = parseInt(process.env.MAIL_PORT || process.env.SMTP_PORT || "587", 10);
  const mailUser = process.env.MAIL_USER || process.env.SMTP_USER;
  const mailPass = process.env.MAIL_PASSWORD || process.env.SMTP_PASS;

  if (!mailHost || !mailUser || !mailPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: mailHost,
    port: mailPort,
    secure: mailPort === 465, // true for 465, false for other ports
    auth: {
      user: mailUser,
      pass: mailPass,
    },
    // Useful for local testing with self-signed certs if needed
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
}

/**
 * Verified startup check for SMTP configuration.
 */
async function verifyEmailService() {
  const mailHost = process.env.MAIL_HOST || process.env.SMTP_HOST;
  const mailUser = process.env.MAIL_USER || process.env.SMTP_USER;

  if (!mailHost || !mailUser) {
    console.warn("--------------------------------------------------");
    console.warn("⚠️ [EMAIL SERVICE STATUS]: NOT CONFIGURED");
    console.warn("   MAIL_HOST / MAIL_USER / MAIL_PASSWORD missing in .env.");
    console.warn("   Password reset emails WILL NOT be delivered to real inboxes.");
    console.warn("   Configure SMTP (e.g. Gmail App Password or Resend) in .env to enable.");
    console.warn("--------------------------------------------------");
    return { configured: false, status: "NOT_CONFIGURED" };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log("--------------------------------------------------");
    console.log(`✅ [EMAIL SERVICE STATUS]: READY & VERIFIED`);
    console.log(`   Connected to SMTP Host: ${mailHost}`);
    console.log(`   Sender Account: ${mailUser}`);
    console.log("--------------------------------------------------");
    return { configured: true, status: "READY" };
  } catch (err) {
    console.error("--------------------------------------------------");
    console.error(`❌ [EMAIL SERVICE STATUS]: SMTP CONNECTION FAILED`);
    console.error(`   Host: ${mailHost}`);
    console.error(`   Error: ${err.message}`);
    console.error("--------------------------------------------------");
    return { configured: false, status: "FAILED", error: err.message };
  }
}

/**
 * Send password reset email using configured SMTP transport.
 * @param {string} toEmail - Recipient email address
 * @param {string} resetUrl - Complete password reset link with token
 * @returns {Promise<{sent: boolean, provider: string, messageId?: string, error?: string, message?: string}>}
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  const mailHost = process.env.MAIL_HOST || process.env.SMTP_HOST;
  const mailFrom = process.env.MAIL_FROM || process.env.SMTP_FROM || `GradeWise <${process.env.MAIL_USER || "no-reply@gradewise.edu.in"}>`;
  const transporter = getTransporter();

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - GradeWise</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background-color: #0f172a; padding: 24px 32px; text-align: left; }
    .logo { font-size: 22px; font-weight: 800; color: #ffffff; text-decoration: none; letter-spacing: -0.5px; }
    .logo span { color: #6366f1; }
    .content { padding: 36px 32px; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 20px 0; }
    .btn-wrapper { margin: 28px 0; text-align: left; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2); }
    .note { font-size: 13px; line-height: 1.5; color: #64748b; background: #f8fafc; border-left: 3px solid #6366f1; padding: 12px 16px; border-radius: 4px; margin-top: 24px; }
    .footer { border-top: 1px solid #f1f5f9; padding: 20px 32px; font-size: 13px; color: #94a3b8; text-align: center; background: #f8fafc; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">Grade<span>Wise</span></div>
    </div>
    <div class="content">
      <h1>Reset your password</h1>
      <p>We received a request to reset the password for your GradeWise account. Click the button below to set a new password:</p>
      <div class="btn-wrapper">
        <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
      </div>
      <p>This link will expire after <strong>1 hour</strong> for security reasons.</p>
      <div class="note">
        If you did not request a password reset, you can safely ignore this email. Your account remains secure and no changes were made.
      </div>
    </div>
    <div class="footer">
      GradeWise · Academic performance tracking, made simple.
    </div>
  </div>
</body>
</html>`;

  const textContent = `GradeWise - Reset Your Password\n\nWe received a request to reset your password.\nClick here to reset: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`;

  // IF SMTP IS NOT CONFIGURED IN ENV
  if (!transporter) {
    console.warn(`[EMAIL DIAGNOSTIC WARN] Password reset requested for ${toEmail}, BUT MAIL_HOST/MAIL_USER/MAIL_PASSWORD are not configured in .env.`);
    console.warn(`[EMAIL DIAGNOSTIC LINK]: ${resetUrl}`);
    return {
      sent: false,
      provider: "none",
      error: "email_not_configured",
      message: "Email delivery is not configured on the server. Please check server environment variables.",
    };
  }

  // IF SMTP IS CONFIGURED: SEND ACTUAL EMAIL
  try {
    console.log(`[EMAIL SEND ATTEMPT] Handing password reset email for ${toEmail} to SMTP provider (${mailHost})...`);
    
    const info = await transporter.sendMail({
      from: mailFrom,
      to: toEmail,
      subject: "Reset your GradeWise password",
      text: textContent,
      html: htmlContent,
    });

    console.log(`[EMAIL SEND SUCCESS] Message accepted by ${mailHost}. Recipient: ${toEmail} (MessageID: ${info.messageId})`);
    return {
      sent: true,
      provider: "smtp",
      messageId: info.messageId,
    };
  } catch (err) {
    console.error(`[EMAIL SEND FAILURE] SMTP provider (${mailHost}) rejected message for ${toEmail}: ${err.message}`);
    return {
      sent: false,
      provider: "smtp",
      error: err.message,
      message: `Failed to deliver email via SMTP provider: ${err.message}`,
    };
  }
}

module.exports = {
  verifyEmailService,
  sendPasswordResetEmail,
};
