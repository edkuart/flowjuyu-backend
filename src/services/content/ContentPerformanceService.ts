// src/services/content/ContentPerformanceService.ts
//
// Aggregates daily event data from the analytics tables and writes one row per
// published content item into ai_content_performance_daily.
//
// Attribution strategy: approximate.
//   product_id (analytics tables) → ai_content_items.subject_id (WHERE subject_type='product')
//                                 → ai_content_items.published_variant_id
//
// Only items with a published variant are included (no point tracking unPublished content).
// Rows are upserted via ON CONFLICT so the runner can be re-run safely for the same date.
//
// MIN_IMPRESSIONS = 5: performance_score is NULL below this threshold to avoid
// noisy scores from single-view products.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

const MIN_IMPRESSIONS = 5;

export interface DailyMetrics {
  content_item_id: string;
  content_variant_id: string;
  product_id: string;
  views: number;
  whatsapp_clicks: number;
  intentions: number;
  saves: number;
  engagement_rate: number | null;
  time_on_page_avg: number | null;
}

export interface PerformanceRow extends DailyMetrics {
  click_rate: number | null;
  whatsapp_rate: number | null;
  intent_rate: number | null;
  performance_score: number | null;
}

// ─── Score formula ────────────────────────────────────────────────────────────

export function computePerformanceScore(metrics: {
  views: number;
  intent_rate: number | null;
  whatsapp_rate: number | null;
  click_rate: number | null;
  engagement_rate: number | null;
}): number | null {
  if (metrics.views < MIN_IMPRESSIONS) return null;

  const intent      = metrics.intent_rate      ?? 0;
  const whatsapp    = metrics.whatsapp_rate     ?? 0;
  const click       = metrics.click_rate        ?? 0;
  const engagement  = metrics.engagement_rate   ?? 0;

  const raw = 0.40 * intent + 0.25 * whatsapp + 0.20 * click + 0.15 * engagement;

  // Clamp to [0, 1] and round to 3 decimal places
  return Math.round(Math.min(Math.max(raw, 0), 1) * 1000) / 1000;
}

// ─── Main aggregation ─────────────────────────────────────────────────────────

/**
 * Aggregates all analytics events for `dateStr` ('YYYY-MM-DD') and upserts
 * performance rows for every product that has a published AI content variant.
 *
 * Returns the count of rows written.
 */
export async function aggregateDailyPerformance(dateStr: string): Promise<number> {
  // Determine if product_sessions table exists (optional, may not be in all envs)
  const sessionRows = await sequelize.query<{ exists: boolean }>(
    `SELECT to_regclass('public.product_sessions') IS NOT NULL AS exists`,
    { type: QueryTypes.SELECT }
  );
  const hasSessionTable = sessionRows[0]?.exists ?? false;

  // Build the engagement CTE conditionally
  const engagementCte = hasSessionTable
    ? `
  , eng AS (
    SELECT
      product_id::text                           AS product_id,
      COALESCE(AVG(engagement_duration), 0)      AS time_on_page_avg,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE LEAST(AVG(engagement_duration) / 300.0, 1.0)
      END                                        AS engagement_rate
    FROM product_sessions
    WHERE DATE(created_at) = :date
    GROUP BY product_id
  )`
    : `
  , eng AS (
    SELECT NULL::text AS product_id, 0.0 AS time_on_page_avg, 0.0 AS engagement_rate
    WHERE false
  )`;

  const sql = `
  WITH published_items AS (
    SELECT
      i.id                   AS content_item_id,
      i.subject_id           AS product_id,
      i.published_variant_id AS content_variant_id
    FROM ai_content_items i
    WHERE i.subject_type = 'product'
      AND i.status = 'published'
      AND i.published_variant_id IS NOT NULL
  ),

  pv AS (
    SELECT
      product_id::text AS product_id,
      COUNT(*)::int    AS views
    FROM product_views
    WHERE view_date = :date
    GROUP BY product_id
  ),

  wa AS (
    SELECT
      product_id::text AS product_id,
      COUNT(*)::int    AS whatsapp_clicks
    FROM whatsapp_clicks
    WHERE DATE(created_at) = :date
    GROUP BY product_id
  ),

  pi AS (
    SELECT
      product_id::text AS product_id,
      COUNT(*)::int    AS intentions
    FROM purchase_intentions
    WHERE DATE(created_at) = :date
      AND product_id IS NOT NULL
    GROUP BY product_id
  ),

  fav AS (
    SELECT
      product_id::text AS product_id,
      COUNT(*)::int    AS saves
    FROM favorites
    WHERE DATE(created_at) = :date
    GROUP BY product_id
  )

  ${engagementCte}

  SELECT
    pub.content_item_id,
    pub.content_variant_id,
    pub.product_id,
    COALESCE(pv.views, 0)              AS views,
    COALESCE(wa.whatsapp_clicks, 0)    AS whatsapp_clicks,
    COALESCE(pi.intentions, 0)         AS intentions,
    COALESCE(fav.saves, 0)             AS saves,
    COALESCE(eng.engagement_rate, 0)   AS engagement_rate,
    COALESCE(eng.time_on_page_avg, 0)  AS time_on_page_avg
  FROM published_items pub
  LEFT JOIN pv   ON pv.product_id   = pub.product_id
  LEFT JOIN wa   ON wa.product_id   = pub.product_id
  LEFT JOIN pi   ON pi.product_id   = pub.product_id
  LEFT JOIN fav  ON fav.product_id  = pub.product_id
  LEFT JOIN eng  ON eng.product_id  = pub.product_id
  `;

  const rows = await sequelize.query<DailyMetrics>(sql, {
    replacements: { date: dateStr },
    type: QueryTypes.SELECT,
  });

  if (rows.length === 0) return 0;

  let written = 0;

  for (const row of rows) {
    const views = Number(row.views) || 0;

    const click_rate = views > 0
      ? Math.round((Number(row.saves) / views) * 10000) / 10000
      : null;

    const whatsapp_rate = views > 0
      ? Math.round((Number(row.whatsapp_clicks) / views) * 10000) / 10000
      : null;

    const intent_rate = views > 0
      ? Math.round((Number(row.intentions) / views) * 10000) / 10000
      : null;

    const engagement_rate = row.engagement_rate != null
      ? Math.round(Number(row.engagement_rate) * 10000) / 10000
      : null;

    const performance_score = computePerformanceScore({
      views,
      intent_rate,
      whatsapp_rate,
      click_rate,
      engagement_rate,
    });

    await sequelize.query(
      `
      INSERT INTO ai_content_performance_daily (
        id,
        content_item_id, content_variant_id,
        recorded_date, channel,
        impressions, views, clicks, whatsapp_clicks, intentions, saves,
        engagement_rate, click_rate, whatsapp_rate, intent_rate,
        time_on_page_avg, performance_score,
        attribution_confidence, source_event_type,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        :content_item_id, :content_variant_id,
        :recorded_date, 'organic',
        :views, :views, :saves, :whatsapp_clicks, :intentions, :saves,
        :engagement_rate, :click_rate, :whatsapp_rate, :intent_rate,
        :time_on_page_avg, :performance_score,
        'approximate', 'product_views+whatsapp_clicks+purchase_intentions+favorites',
        NOW(), NOW()
      )
      ON CONFLICT (content_item_id, content_variant_id, recorded_date, channel)
      DO UPDATE SET
        impressions        = EXCLUDED.impressions,
        views              = EXCLUDED.views,
        clicks             = EXCLUDED.clicks,
        whatsapp_clicks    = EXCLUDED.whatsapp_clicks,
        intentions         = EXCLUDED.intentions,
        saves              = EXCLUDED.saves,
        engagement_rate    = EXCLUDED.engagement_rate,
        click_rate         = EXCLUDED.click_rate,
        whatsapp_rate      = EXCLUDED.whatsapp_rate,
        intent_rate        = EXCLUDED.intent_rate,
        time_on_page_avg   = EXCLUDED.time_on_page_avg,
        performance_score  = EXCLUDED.performance_score,
        updated_at         = NOW()
      `,
      {
        replacements: {
          content_item_id:   row.content_item_id,
          content_variant_id: row.content_variant_id,
          recorded_date:     dateStr,
          views,
          saves:             Number(row.saves) || 0,
          whatsapp_clicks:   Number(row.whatsapp_clicks) || 0,
          intentions:        Number(row.intentions) || 0,
          engagement_rate:   engagement_rate ?? 0,
          click_rate:        click_rate ?? 0,
          whatsapp_rate:     whatsapp_rate ?? 0,
          intent_rate:       intent_rate ?? 0,
          time_on_page_avg:  row.time_on_page_avg != null ? Number(row.time_on_page_avg) : 0,
          performance_score,
        },
        type: QueryTypes.INSERT,
      }
    );

    written++;
  }

  return written;
}
