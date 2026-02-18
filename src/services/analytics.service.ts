import { QueryTypes } from "sequelize"
import { sequelize } from "../models"

/* =====================================================
   TYPES
===================================================== */

export interface Last30DaysPoint {
  date: string
  product_views: number
  profile_views: number
}

export interface TopProduct {
  id: string
  nombre: string
  total_views: number
}

export interface SellerAnalyticsData {
  totalProductViews: number
  totalProfileViews: number
  topProducts: TopProduct[]
  last30Days: Last30DaysPoint[]
}

/* =====================================================
   MAIN ANALYTICS SERVICE
===================================================== */

export async function getSellerAnalyticsData(
  sellerId: number
): Promise<SellerAnalyticsData> {

  /* ==============================
     TOTAL PRODUCT VIEWS
  ============================== */
  const [productViews] = await sequelize.query<{ total: number }>(
    `
    SELECT COUNT(*)::int as total
    FROM product_views pv
    JOIN productos p ON p.id = pv.product_id
    WHERE p.vendedor_id = :sellerId
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* ==============================
     TOTAL PROFILE VIEWS
  ============================== */
  const [profileViews] = await sequelize.query<{ total: number }>(
    `
    SELECT COUNT(*)::int as total
    FROM seller_views
    WHERE seller_id = :sellerId
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* ==============================
     TOP PRODUCTS
  ============================== */
  const topProducts = await sequelize.query<TopProduct>(
    `
    SELECT 
      p.id,
      p.nombre,
      COUNT(pv.id)::int as total_views
    FROM product_views pv
    JOIN productos p ON p.id = pv.product_id
    WHERE p.vendedor_id = :sellerId
    GROUP BY p.id, p.nombre
    ORDER BY total_views DESC
    LIMIT 5
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* ==============================
     LAST 30 DAYS TREND
  ============================== */
  const rawLast30 = await sequelize.query<Last30DaysPoint>(
    `
    SELECT 
      date_series::date as date,
      COALESCE(pv.count, 0) as product_views,
      COALESCE(sv.count, 0) as profile_views
    FROM generate_series(
      CURRENT_DATE - INTERVAL '29 days',
      CURRENT_DATE,
      '1 day'
    ) AS date_series
    LEFT JOIN (
      SELECT 
        DATE(viewed_at) as date,
        COUNT(*)::int as count
      FROM product_views pv
      JOIN productos p ON p.id = pv.product_id
      WHERE p.vendedor_id = :sellerId
      GROUP BY DATE(viewed_at)
    ) pv ON pv.date = date_series
    LEFT JOIN (
      SELECT 
        DATE(viewed_at) as date,
        COUNT(*)::int as count
      FROM seller_views
      WHERE seller_id = :sellerId
      GROUP BY DATE(viewed_at)
    ) sv ON sv.date = date_series
    ORDER BY date_series ASC
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  return {
    totalProductViews: productViews?.total ?? 0,
    totalProfileViews: profileViews?.total ?? 0,
    topProducts,
    last30Days: rawLast30.map((row) => ({
      date: row.date,
      product_views: Number(row.product_views),
      profile_views: Number(row.profile_views),
    })),
  }
}
