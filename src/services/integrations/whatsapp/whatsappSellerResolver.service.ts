import { QueryTypes } from "sequelize";
import { sequelize } from "../../../config/db";

export type ResolvedSeller = {
  user_id: number;
  profile_id: number;
  nombre_comercio: string;
};

function digitsOnly(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

function localDigits(input: string): string {
  const digits = digitsOnly(input);
  return digits.length > 8 ? digits.slice(-8) : digits;
}

export async function resolveSellerByPhone(
  phoneE164: string
): Promise<ResolvedSeller | null> {
  const phoneDigits = digitsOnly(phoneE164);
  const local = localDigits(phoneE164);

  if (!phoneDigits) return null;

  const rows = await sequelize.query<ResolvedSeller>(
    `
    SELECT
      u.id             AS user_id,
      vp.id            AS profile_id,
      vp.nombre_comercio
    FROM vendedor_perfil vp
    JOIN users u
      ON u.id = vp.user_id
    WHERE u.rol = 'seller'
      AND (
        regexp_replace(COALESCE(u.telefono, ''), '\\D', '', 'g') = :phoneDigits
        OR regexp_replace(COALESCE(vp.telefono, ''), '\\D', '', 'g') = :phoneDigits
        OR concat(
            COALESCE(vp.telefono_comercio->>'country_code', ''),
            COALESCE(vp.telefono_comercio->>'number', '')
          ) = :phoneDigits
        OR concat(
            COALESCE(vp.whatsapp_numero->>'country_code', ''),
            COALESCE(vp.whatsapp_numero->>'number', '')
          ) = :phoneDigits
        OR COALESCE(vp.telefono_comercio->>'number', '') = :localDigits
        OR COALESCE(vp.whatsapp_numero->>'number', '') = :localDigits
      )
    ORDER BY
      CASE
        WHEN concat(
          COALESCE(vp.whatsapp_numero->>'country_code', ''),
          COALESCE(vp.whatsapp_numero->>'number', '')
        ) = :phoneDigits THEN 0
        ELSE 1
      END,
      vp.id ASC
    LIMIT 1
    `,
    {
      replacements: {
        phoneDigits,
        localDigits: local,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}
