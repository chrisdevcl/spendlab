import nodemailer from "nodemailer";

// ─── SMTP transporter ────────────────────────────────────────────────────────
// Uses Fastmail SMTP (or any SMTP provider).
// Configure via environment variables — see .env.example.

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? "smtp.fastmail.com",
    port:   Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM =
  process.env.SMTP_FROM ??
  process.env.SMTP_USER ??
  "SpendLab <noreply@example.com>";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3741";

// ─── HTML template ───────────────────────────────────────────────────────────

function buildHtml({
  inviterName,
  groupName,
  inviteUrl,
}: {
  inviterName: string;
  groupName: string;
  inviteUrl: string;
}): string {
  // noinspection HtmlDeprecatedAttribute -- required for Outlook compatibility
  return /* html */ `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Te invitaron a SpendLab</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f3;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- Logo / eyebrow -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0D9488;">
                SpendLab
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:20px;padding:40px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

              <!-- Heading -->
              <p style="margin:0 0 8px 0;font-family:Georgia,'Palatino Linotype',Palatino,serif;font-size:26px;font-weight:400;line-height:1.25;color:#1c1c1c;">
                ${escapeHtml(inviterName)} te invitó a dividir gastos
              </p>

              <!-- Subheading -->
              <p style="margin:0 0 28px 0;font-size:15px;color:#6b7280;line-height:1.5;">
                Te han agregado al grupo
                <strong style="color:#1c1c1c;">${escapeHtml(groupName)}</strong>
                en SpendLab. Acepta la invitación para ver los gastos compartidos y llevar las cuentas sin drama.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a
                      href="${inviteUrl}"
                      style="display:inline-block;background-color:#0D9488;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:9999px;letter-spacing:0.01em;"
                    >
                      Ver invitación →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td style="height:1px;background-color:#e5e7eb;"></td>
                </tr>
              </table>

              <!-- Footer note -->
              <p style="margin:0;font-size:12.5px;color:#9ca3af;line-height:1.6;text-align:center;">
                Tu correo ya está ingresado — solo haz clic y accede.<br />
                Si no esperabas esta invitación, puedes ignorar este correo.
              </p>

            </td>
          </tr>

          <!-- Bottom spacer / branding -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <span style="font-size:12px;color:#9ca3af;">
                SpendLab · lleva las cuentas sin drama
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendInvitationEmail({
  toEmail,
  inviterName,
  groupName,
}: {
  toEmail: string;
  inviterName: string;
  groupName: string;
}): Promise<void> {
  const inviteUrl = `${APP_URL}/login?email=${encodeURIComponent(toEmail)}`;

  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from:    FROM,
      to:      toEmail,
      subject: `${inviterName} te invitó a "${groupName}" en SpendLab`,
      html:    buildHtml({ inviterName, groupName, inviteUrl }),
    });
  } catch (err) {
    // Log but do not throw — email is fire-and-forget so the invitation
    // is never blocked by email delivery issues.
    console.error("[sendInvitationEmail] SMTP error:", err);
  }
}
