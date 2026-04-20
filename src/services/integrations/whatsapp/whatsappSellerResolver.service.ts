import { QueryTypes } from "sequelize";
import { sequelize } from "../../../config/db";
import { normalizePhoneE164 } from "./whatsappLinking.service";

export type ResolvedSeller = {
  user_id: number;
  nombre_comercio: string;
};

export type SellerProfilePhoneMatch = {
  user_id: number;
  nombre_comercio: string;
  has_active_link: boolean;
};

export async function resolveSellerByPhone(
  phoneE164: string
): Promise<ResolvedSeller | null> {
  const normalizedPhone = normalizePhoneE164(phoneE164);
  if (!normalizedPhone) return null;

  const rows = await sequelize.query<ResolvedSeller>(
    `
    SELECT
      u.id AS user_id,
      vp.nombre_comercio
    FROM whatsapp_linked_identities wli
    JOIN users u
      ON u.id = wli.seller_user_id
    JOIN vendedor_perfil vp
      ON vp.user_id = u.id
    WHERE u.rol = 'seller'
      AND wli.channel = 'whatsapp'
      AND wli.status = 'active'
      AND wli.phone_e164 = :phoneE164
    LIMIT 1
    `,
    {
      replacements: {
        phoneE164: normalizedPhone,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

export async function resolveSellerByProfileWhatsappPhone(
  phoneE164: string
): Promise<SellerProfilePhoneMatch | null> {
  const normalizedPhone = normalizePhoneE164(phoneE164);
  if (!normalizedPhone) return null;

  const rows = await sequelize.query<SellerProfilePhoneMatch>(
    `
    SELECT
      u.id AS user_id,
      vp.nombre_comercio,
      EXISTS (
        SELECT 1
        FROM whatsapp_linked_identities wli
        WHERE wli.seller_user_id = u.id
          AND wli.channel = 'whatsapp'
          AND wli.status = 'active'
      ) AS has_active_link
    FROM users u
    JOIN vendedor_perfil vp
      ON vp.user_id = u.id
    WHERE u.rol = 'seller'
      AND CONCAT(
        '+',
        COALESCE(vp.whatsapp_numero->>'country_code', ''),
        COALESCE(vp.whatsapp_numero->>'number', '')
      ) = :phoneE164
    LIMIT 1
    `,
    {
      replacements: {
        phoneE164: normalizedPhone,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}
