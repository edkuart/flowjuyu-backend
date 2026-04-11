// src/services/emailTemplates/welcome.ts
//
// Triggered immediately on seller_created.
// Goal: warm welcome + single CTA to complete the profile.

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://flowjuyu.com';

export function welcomeEmailSubject(nombre: string): string {
  return `Bienvenido a Flowjuyu, ${nombre}`;
}

export function welcomeEmailHtml(nombre: string, nombreComercio: string): string {
  const ctaUrl = `${FRONTEND_URL}/seller/onboarding`;

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;">

    <!-- Header -->
    <div style="background:#0F3D3A;padding:24px 32px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Flowjuyu</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 12px;font-size:20px;color:#111111;">Hola ${nombre},</h2>

      <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.6;">
        Ya eres parte de Flowjuyu. Tu tienda <strong>${nombreComercio}</strong>
        está lista para recibir sus primeros clientes.
      </p>

      <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.6;">
        El siguiente paso es completar tu perfil y publicar tu primer producto.
        Solo toma unos minutos.
      </p>

      <a href="${ctaUrl}"
         style="display:inline-block;background:#0F3D3A;color:#ffffff;
                padding:13px 28px;border-radius:8px;text-decoration:none;
                font-size:15px;font-weight:600;">
        Completar mi perfil
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #eeeeee;">
      <p style="margin:0;font-size:12px;color:#aaaaaa;line-height:1.5;">
        Este mensaje fue enviado porque te registraste como vendedor en Flowjuyu.<br>
        Si tienes dudas, responde a este correo.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}
