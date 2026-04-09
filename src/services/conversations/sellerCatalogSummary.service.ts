import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";
import type { CatalogContextItem } from "./conversationCommandContext.types";
import { buildProductListMessage } from "./ux/conversationUxBuilder.service";

type SellerCatalogRow = {
  id: string;
  nombre: string;
  activo: boolean;
  precio: string;
};

type SellerCatalogStats = {
  total: number;
  active: number;
  inactive: number;
};

export async function getSellerCatalogSummaryData(
  sellerUserId: number
): Promise<{
  responseText: string;
  items: CatalogContextItem[];
}> {
  const statsRows = await sequelize.query<SellerCatalogStats>(
    `
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(CASE WHEN activo = true THEN 1 ELSE 0 END), 0)::int AS active,
      COALESCE(SUM(CASE WHEN activo = false THEN 1 ELSE 0 END), 0)::int AS inactive
    FROM productos
    WHERE vendedor_id = :sellerUserId
    `,
    {
      replacements: { sellerUserId },
      type: QueryTypes.SELECT,
    }
  );

  const rows = await sequelize.query<SellerCatalogRow>(
    `
    SELECT id, nombre, activo, precio::text
    FROM productos
    WHERE vendedor_id = :sellerUserId
    ORDER BY created_at DESC
    LIMIT 5
    `,
    {
      replacements: { sellerUserId },
      type: QueryTypes.SELECT,
    }
  );

  const stats = statsRows[0] ?? { total: 0, active: 0, inactive: 0 };

  if (!stats.total) {
    return {
      responseText: buildProductListMessage([]),
      items: [],
    };
  }

  const items: CatalogContextItem[] = rows.map((product, index) => ({
    index: index + 1,
    productId: product.id,
    nombre: product.nombre,
    activo: product.activo,
  }));

  return {
    responseText: buildProductListMessage(
      rows.map((product, index) => ({
        index: index + 1,
        nombre: product.nombre,
        precio: Number(product.precio),
        activo: product.activo,
      }))
    ),
    items,
  };
}

export async function buildSellerCatalogSummary(
  sellerUserId: number
): Promise<string> {
  const result = await getSellerCatalogSummaryData(sellerUserId);
  return result.responseText;
}
