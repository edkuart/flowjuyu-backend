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

export interface TopIntentionProduct {
  id: string
  nombre: string
  total_intentions: number
}

export interface IntentionBySource {
  source: string
  total: number
}

export interface SellerAnalyticsData {
  totalProductViews: number
  totalProfileViews: number
  topProducts: TopProduct[]
  last30Days: Last30DaysPoint[]

  // 🔥 NUEVO — INTENCIÓN COMERCIAL
  totalIntentions: number
  last30Intentions: number
  topIntentionProducts: TopIntentionProduct[]
  intentionsBySource: IntentionBySource[]
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
     TOP PRODUCTS (VIEWS)
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
     LAST 30 DAYS TREND (VIEWS)
  ============================== */
  const rawLast30 = await sequelize.query<Last30DaysPoint>(
    `
    SELECT 
      gs.date,
      COALESCE(pv.count, 0) AS product_views,
      COALESCE(sv.count, 0) AS profile_views
    FROM (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '29 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS date
    ) gs
    LEFT JOIN (
      SELECT 
        DATE(viewed_at) AS date,
        COUNT(*)::int AS count
      FROM product_views pv
      JOIN productos p ON p.id = pv.product_id
      WHERE p.vendedor_id = :sellerId
        AND viewed_at >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY DATE(viewed_at)
    ) pv ON pv.date = gs.date
    LEFT JOIN (
      SELECT 
        DATE(viewed_at) AS date,
        COUNT(*)::int AS count
      FROM seller_views
      WHERE seller_id = :sellerId
        AND viewed_at >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY DATE(viewed_at)
    ) sv ON sv.date = gs.date
    ORDER BY gs.date ASC
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  );

  /* =====================================================
     🔥 INTENCIÓN COMERCIAL
  ===================================================== */

  /* ==============================
     TOTAL INTENTIONS
  ============================== */
  const [totalIntentionsResult] = await sequelize.query<{ total: number }>(
    `
    SELECT COUNT(*)::int as total
    FROM purchase_intentions
    WHERE seller_id = :sellerId
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* ==============================
     LAST 30 DAYS INTENTIONS
  ============================== */
  const [last30IntentionsResult] = await sequelize.query<{ total: number }>(
    `
    SELECT COUNT(*)::int as total
    FROM purchase_intentions
    WHERE seller_id = :sellerId
      AND created_at >= NOW() - INTERVAL '30 days'
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* ==============================
     TOP PRODUCTS BY INTENTIONS
  ============================== */
  const topIntentionProducts = await sequelize.query<TopIntentionProduct>(
    `
    SELECT 
      p.id,
      p.nombre,
      COUNT(pi.id)::int as total_intentions
    FROM purchase_intentions pi
    JOIN productos p ON p.id = pi.product_id
    WHERE pi.seller_id = :sellerId
    GROUP BY p.id, p.nombre
    ORDER BY total_intentions DESC
    LIMIT 5
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* ==============================
     INTENTIONS BY SOURCE
  ============================== */
  const intentionsBySource = await sequelize.query<IntentionBySource>(
    `
    SELECT 
      source,
      COUNT(*)::int as total
    FROM purchase_intentions
    WHERE seller_id = :sellerId
    GROUP BY source
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  )

  /* =====================================================
     RETURN FINAL
  ===================================================== */

  return {
    totalProductViews: productViews?.total ?? 0,
    totalProfileViews: profileViews?.total ?? 0,
    topProducts,
    last30Days: rawLast30.map((row) => ({
      date: row.date,
      product_views: Number(row.product_views),
      profile_views: Number(row.profile_views),
    })),

    // 🔥 NUEVO
    totalIntentions: totalIntentionsResult?.total ?? 0,
    last30Intentions: last30IntentionsResult?.total ?? 0,
    topIntentionProducts,
    intentionsBySource,
  }
}