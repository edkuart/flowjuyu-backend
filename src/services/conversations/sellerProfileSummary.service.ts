import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";
import { buildProfileMessage } from "./ux/conversationUxBuilder.service";

type SellerProfileSummary = {
  nombre_comercio: string;
  seller_name: string;
  phone_display: string | null;
  total_products: number;
  active_products: number;
};

export async function buildSellerProfileSummary(
  sellerUserId: number
): Promise<string> {
  const rows = await sequelize.query<SellerProfileSummary>(
    `
    SELECT
      vp.nombre_comercio,
      u.nombre AS seller_name,
      COALESCE(
        concat(
          COALESCE(vp.whatsapp_numero->>'country_code', ''),
          ' ',
          COALESCE(vp.whatsapp_numero->>'number', '')
        ),
        u.telefono
      ) AS phone_display,
      COALESCE(COUNT(p.id), 0)::int AS total_products,
      COALESCE(SUM(CASE WHEN p.activo = true THEN 1 ELSE 0 END), 0)::int AS active_products
    FROM vendedor_perfil vp
    JOIN users u
      ON u.id = vp.user_id
    LEFT JOIN productos p
      ON p.vendedor_id = vp.user_id
    WHERE vp.user_id = :sellerUserId
    GROUP BY vp.nombre_comercio, u.nombre, phone_display
    LIMIT 1
    `,
    {
      replacements: { sellerUserId },
      type: QueryTypes.SELECT,
    }
  );

  const profile = rows[0];
  if (!profile) {
    return "No pude encontrar tu perfil de vendedor en este momento.";
  }

  return buildProfileMessage({
    nombreComercio: profile.nombre_comercio,
    sellerName: profile.seller_name,
    phoneDisplay: profile.phone_display,
    totalProducts: profile.total_products,
    activeProducts: profile.active_products,
  });
}
