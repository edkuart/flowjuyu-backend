// src/services/email.service.ts

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Flowjuyu <onboarding@resend.dev>";

// ── Generic send ─────────────────────────────────────────────────────────────
// Low-level wrapper used by lifecycle email functions.
// Guards against missing RESEND_API_KEY without throwing in dev.

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log("─────────────────────────────────────────");
    console.log(`📧 [DEV] Email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log("─────────────────────────────────────────");
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️  RESEND_API_KEY not set — email skipped.");
    return;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });

  if (error) {
    console.error(`❌ Resend error [${subject}] to ${to}:`, error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  console.log(`✅ Email sent to ${to}. Resend ID: ${data?.id}`);
}

export async function sendResetPasswordEmail(
  to: string,
  resetLink: string,
  nombre: string
): Promise<void> {
  // ── Development fallback ─────────────────────────────────────────────────
  // Always print the link in dev so you can test without a real Resend key.
  if (process.env.NODE_ENV !== "production") {
    console.log("─────────────────────────────────────────");
    console.log("🔗 [DEV] Password reset link for:", to);
    console.log("   ", resetLink);
    console.log("─────────────────────────────────────────");
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️  RESEND_API_KEY is not set — email not sent.");
    return;
  }

  // ── Send via Resend ──────────────────────────────────────────────────────
  console.log(`📧 Sending reset email to: ${to}`);

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Flowjuyu <noreply@flowjuyu.com>",
    to,
    subject: "Restablecer tu contraseña - Flowjuyu",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;">
        <h2 style="font-size:22px;color:#111111;margin-bottom:8px;">Hola ${nombre},</h2>
        <p style="font-size:15px;color:#444444;line-height:1.6;margin-bottom:24px;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en
          <strong>Flowjuyu</strong>. Haz clic en el botón para continuar:
        </p>

        <a href="${resetLink}"
           style="display:inline-block;background:#0F3D3A;color:#ffffff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
          Restablecer contraseña
        </a>

        <p style="margin-top:24px;font-size:13px;color:#888888;line-height:1.5;">
          Si no solicitaste este cambio, puedes ignorar este correo.
          El enlace expira en <strong>15 minutos</strong>.
        </p>

        <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;" />
        <p style="font-size:11px;color:#aaaaaa;">
          Este mensaje fue enviado automáticamente por Flowjuyu.
          Por favor no respondas a este correo.
        </p>
      </div>
    `,
  });

  if (error) {
    // Log with full detail so it's visible in server logs without crashing the
    // request. The caller (forgotPassword) still returns 200 to avoid enumeration.
    console.error("❌ Resend error sending reset email:", error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  console.log(`✅ Reset email sent. Resend ID: ${data?.id}`);
}
