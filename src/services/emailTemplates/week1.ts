// src/services/emailTemplates/week1.ts
//
// Sent ~7 days after registration. Two variants:
//   hasProduct = true  → celebrate + suggest sharing the store
//   hasProduct = false → empathetic nudge + link to publish

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://flowjuyu.com';

export function week1EmailSubject(hasProduct: boolean): string {
  return hasProduct
    ? '¿Cómo va tu primera semana?'
    : 'Aún estás a tiempo de empezar';
}

export function week1EmailHtml(
  nombre: string,
  nombreComercio: string,
  hasProduct: boolean,
): string {
  const onboardingUrl = `${FRONTEND_URL}/seller/onboarding`;
  const dashboardUrl  = `${FRONTEND_URL}/seller/dashboard`;

  const bodyContent = hasProduct
    ? `
      <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.6;">
        Llevas una semana en Flowjuyu y ya tienes productos en tu tienda
        <strong>${nombreComercio}</strong>. Eso es un buen comienzo.
      </p>

      <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.6;">
        El siguiente paso para atraer tus primeros compradores es compartir
        el enlace de tu tienda con tu red — familia, amigos, clientes que ya
        te conocen. Ellos serán tus primeras ventas.
      </p>

      <a href="${dashboardUrl}"
         style="display:inline-block;background:#0F3D3A;color:#ffffff;
                padding:13px 28px;border-radius:8px;text-decoration:none;
                font-size:15px;font-weight:600;">
        Ver mi tienda
      </a>
    `
    : `
      <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.6;">
        Han pasado 7 días desde que te registraste en Flowjuyu, pero tu
        tienda <strong>${nombreComercio}</strong> aún no tiene productos.
      </p>

      <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.6;">
        Sabemos que empezar puede dar un poco de vértigo. Si algo te está
        deteniendo, responde a este correo y te ayudamos a resolverlo.
      </p>

      <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.6;">
        Si ya estás listo, aquí puedes publicar en menos de 5 minutos:
      </p>

      <a href="${onboardingUrl}"
         style="display:inline-block;background:#0F3D3A;color:#ffffff;
                padding:13px 28px;border-radius:8px;text-decoration:none;
                font-size:15px;font-weight:600;">
        Publicar mi primer producto
      </a>
    `;

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
      ${bodyContent}
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
