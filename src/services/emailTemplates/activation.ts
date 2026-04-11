// src/services/emailTemplates/activation.ts
//
// Sent ~24h after registration if the seller has not published a product yet.
// Goal: remove friction — push them to publish that first product.

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://flowjuyu.com';

export function activationEmailSubject(): string {
  return 'Tu tienda te está esperando';
}

export function activationEmailHtml(nombre: string, nombreComercio: string): string {
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
        Notamos que tu tienda <strong>${nombreComercio}</strong> aún no tiene
        su primer producto publicado.
      </p>

      <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.6;">
        Solo necesitas: un nombre, una foto y un precio.
        Puedes mejorar los detalles después — lo importante es empezar.
      </p>

      <a href="${ctaUrl}"
         style="display:inline-block;background:#0F3D3A;color:#ffffff;
                padding:13px 28px;border-radius:8px;text-decoration:none;
                font-size:15px;font-weight:600;">
        Publicar mi primer producto
      </a>

      <p style="margin:28px 0 0;font-size:13px;color:#888888;line-height:1.5;">
        Si tienes alguna duda, responde a este correo y te ayudamos.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #eeeeee;">
      <p style="margin:0;font-size:12px;color:#aaaaaa;line-height:1.5;">
        Flowjuyu — marketplace de artesanías guatemaltecas.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}
