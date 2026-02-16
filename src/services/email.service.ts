// src/services/email.service.ts

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendResetPasswordEmail(
  to: string,
  resetLink: string,
  nombre: string
) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY no configurado");
    return;
  }

  await resend.emails.send({
    from: "Flowjuyu <onboarding@resend.dev>",
    to,
    subject: "Restablecer tu contraseña - Flowjuyu",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Hola ${nombre},</h2>
        <p>Haz clic en el botón para restablecer tu contraseña:</p>

        <a href="${resetLink}"
           style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">
           Restablecer contraseña
        </a>

        <p style="margin-top:20px;font-size:12px;color:#666;">
          Este enlace expira en 15 minutos.
        </p>
      </div>
    `,
  });
}
