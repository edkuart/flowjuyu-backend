"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerAnalyticsData = getSellerAnalyticsData;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
async function getSellerAnalyticsData(sellerId) {
    const [productViews] = await models_1.sequelize.query(`
    SELECT COUNT(*)::int as total
    FROM product_views pv
    JOIN productos p ON p.id = pv.product_id
    WHERE p.vendedor_id = :sellerId
    `, {
        replacements: { sellerId },
        type: sequelize_1.QueryTypes.SELECT,
    });
    const [profileViews] = await models_1.sequelize.query(`
    SELECT COUNT(*)::int as total
    FROM seller_views
    WHERE seller_id = :sellerId
    `, {
        replacements: { sellerId },
        type: sequelize_1.QueryTypes.SELECT,
    });
    const topProducts = await models_1.sequelize.query(`
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
    `, {
        replacements: { sellerId },
        type: sequelize_1.QueryTypes.SELECT,
    });
    const rawLast30 = await models_1.sequelize.query(`
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
    `, {
        replacements: { sellerId },
        type: sequelize_1.QueryTypes.SELECT,
    });
    return {
        totalProductViews: productViews?.total ?? 0,
        totalProfileViews: profileViews?.total ?? 0,
        topProducts,
        last30Days: rawLast30.map((row) => ({
            date: row.date,
            product_views: Number(row.product_views),
            profile_views: Number(row.profile_views),
        })),
    };
}
