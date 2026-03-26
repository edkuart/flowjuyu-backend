/**
 * flow-ai/runners/run-content-performance-rollup.js
 *
 * Phase 3: Content Performance Rollup Runner
 *
 * Runs independently from the Express server using a raw pg client.
 * Does two things:
 *   1. Aggregates yesterday's analytics events into ai_content_performance_daily
 *      (upsert — safe to re-run for the same date).
 *   2. Analyzes the last 7 days of performance data and writes:
 *        flow-ai/artifacts/content-learning-YYYY-MM-DD.json   (full report)
 *        flow-ai/memory/content-decisions.json                 (repeat/stop map)
 *
 * Self-contained: only requires pg + dotenv — no Express, no Sequelize.
 * Exits with code 0 on success, 1 on fatal error.
 */

require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────

const MIN_IMPRESSIONS = 5;
const LOOKBACK_DAYS   = 7;
const MIN_DAYS_STOP   = 3;

const artifactsDir = path.join(__dirname, "../artifacts");
const memoryDir    = path.join(__dirname, "../memory");

// Ensure directories exist
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
if (!fs.existsSync(memoryDir))    fs.mkdirSync(memoryDir,    { recursive: true });

// ─── DB connection ────────────────────────────────────────────────────────────

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase")
      ? { rejectUnauthorized: false }
      : false,
  });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

// ─── Score formula ────────────────────────────────────────────────────────────

function computePerformanceScore(views, intentRate, whatsappRate, clickRate, engagementRate) {
  if (views < MIN_IMPRESSIONS) return null;
  const raw = 0.40 * (intentRate || 0)
            + 0.25 * (whatsappRate || 0)
            + 0.20 * (clickRate || 0)
            + 0.15 * (engagementRate || 0);
  return Math.round(Math.min(Math.max(raw, 0), 1) * 1000) / 1000;
}

// ─── Step 1: Aggregate daily performance ─────────────────────────────────────

async function aggregateDay(client, dateStr) {
  console.log(`\n[rollup] Aggregating performance for date: ${dateStr}`);

  // Check if product_sessions exists
  const sessCheck = await client.query(
    `SELECT to_regclass('public.product_sessions') IS NOT NULL AS exists`
  );
  const hasSessions = sessCheck.rows[0]?.exists ?? false;

  const engagementCte = hasSessions
    ? `
  , eng AS (
    SELECT
      product_id::text                                               AS product_id,
      COALESCE(AVG(engagement_duration), 0)                         AS time_on_page_avg,
      LEAST(COALESCE(AVG(engagement_duration) / 300.0, 0), 1.0)    AS engagement_rate
    FROM product_sessions
    WHERE DATE(created_at) = $1
    GROUP BY product_id
  )`
    : `
  , eng AS (
    SELECT NULL::text AS product_id, 0.0::float AS time_on_page_avg, 0.0::float AS engagement_rate
    WHERE false
  )`;

  const aggSql = `
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
  pv  AS (SELECT product_id::text, COUNT(*)::int AS views          FROM product_views        WHERE view_date = $1            GROUP BY product_id),
  wa  AS (SELECT product_id::text, COUNT(*)::int AS whatsapp_clicks FROM whatsapp_clicks      WHERE DATE(created_at) = $1    GROUP BY product_id),
  pi  AS (SELECT product_id::text, COUNT(*)::int AS intentions      FROM purchase_intentions  WHERE DATE(created_at) = $1 AND product_id IS NOT NULL GROUP BY product_id),
  fav AS (SELECT product_id::text, COUNT(*)::int AS saves           FROM favorites            WHERE DATE(created_at) = $1    GROUP BY product_id)
  ${engagementCte}
  SELECT
    pub.content_item_id,
    pub.content_variant_id,
    pub.product_id,
    COALESCE(pv.views, 0)             AS views,
    COALESCE(wa.whatsapp_clicks, 0)   AS whatsapp_clicks,
    COALESCE(pi.intentions, 0)        AS intentions,
    COALESCE(fav.saves, 0)            AS saves,
    COALESCE(eng.engagement_rate, 0)  AS engagement_rate,
    COALESCE(eng.time_on_page_avg, 0) AS time_on_page_avg
  FROM published_items pub
  LEFT JOIN pv   ON pv.product_id   = pub.product_id
  LEFT JOIN wa   ON wa.product_id   = pub.product_id
  LEFT JOIN pi   ON pi.product_id   = pub.product_id
  LEFT JOIN fav  ON fav.product_id  = pub.product_id
  LEFT JOIN eng  ON eng.product_id  = pub.product_id
  `;

  const { rows } = await client.query(aggSql, [dateStr]);

  if (rows.length === 0) {
    console.log("[rollup] No published items found — nothing to aggregate.");
    return 0;
  }

  let written = 0;
  for (const row of rows) {
    const views         = Number(row.views) || 0;
    const saves         = Number(row.saves) || 0;
    const wa            = Number(row.whatsapp_clicks) || 0;
    const intentions    = Number(row.intentions) || 0;
    const engRate       = Number(row.engagement_rate) || 0;
    const timeOnPage    = Number(row.time_on_page_avg) || 0;

    const clickRate     = views > 0 ? Math.round(saves / views * 10000) / 10000 : 0;
    const whatsappRate  = views > 0 ? Math.round(wa / views * 10000) / 10000 : 0;
    const intentRate    = views > 0 ? Math.round(intentions / views * 10000) / 10000 : 0;
    const perfScore     = computePerformanceScore(views, intentRate, whatsappRate, clickRate, engRate);

    await client.query(
      `
      INSERT INTO ai_content_performance_daily (
        id, content_item_id, content_variant_id,
        recorded_date, channel,
        impressions, views, clicks, whatsapp_clicks, intentions, saves,
        engagement_rate, click_rate, whatsapp_rate, intent_rate,
        time_on_page_avg, performance_score,
        attribution_confidence, source_event_type,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2,
        $3, 'organic',
        $4, $4, $5, $6, $7, $5,
        $8, $9, $10, $11,
        $12, $13,
        'approximate', 'product_views+whatsapp_clicks+purchase_intentions+favorites',
        NOW(), NOW()
      )
      ON CONFLICT (content_item_id, content_variant_id, recorded_date, channel)
      DO UPDATE SET
        impressions       = EXCLUDED.impressions,
        views             = EXCLUDED.views,
        clicks            = EXCLUDED.clicks,
        whatsapp_clicks   = EXCLUDED.whatsapp_clicks,
        intentions        = EXCLUDED.intentions,
        saves             = EXCLUDED.saves,
        engagement_rate   = EXCLUDED.engagement_rate,
        click_rate        = EXCLUDED.click_rate,
        whatsapp_rate     = EXCLUDED.whatsapp_rate,
        intent_rate       = EXCLUDED.intent_rate,
        time_on_page_avg  = EXCLUDED.time_on_page_avg,
        performance_score = EXCLUDED.performance_score,
        updated_at        = NOW()
      `,
      [
        row.content_item_id, row.content_variant_id,
        dateStr,
        views, saves, wa, intentions,
        engRate, clickRate, whatsappRate, intentRate,
        timeOnPage, perfScore,
      ]
    );
    written++;
  }

  console.log(`[rollup] Upserted ${written} performance rows for ${dateStr}.`);
  return written;
}

// ─── Step 2: Learning analysis ────────────────────────────────────────────────

async function buildLearningReport(client) {
  const dateFrom = daysAgo(LOOKBACK_DAYS);
  const dateTo   = toDateStr(new Date());

  console.log(`\n[learning] Analyzing ${dateFrom} → ${dateTo}`);

  // Perf rows with item metadata
  const { rows: perfRows } = await client.query(
    `
    SELECT
      p.content_item_id,
      p.content_variant_id,
      i.content_type,
      i.subject_id,
      p.recorded_date,
      p.performance_score,
      p.intent_rate,
      p.whatsapp_rate,
      p.click_rate,
      p.views
    FROM ai_content_performance_daily p
    JOIN ai_content_items i ON i.id = p.content_item_id
    WHERE p.recorded_date BETWEEN $1 AND $2
    ORDER BY p.content_item_id, p.recorded_date
    `,
    [dateFrom, dateTo]
  );

  // Content-type aggregates
  const byType = {};
  for (const row of perfRows) {
    const ct = row.content_type;
    if (!byType[ct]) byType[ct] = { scores: [], intent: [], whatsapp: [], click: [] };
    if (row.performance_score != null) byType[ct].scores.push(Number(row.performance_score));
    if (row.intent_rate != null)       byType[ct].intent.push(Number(row.intent_rate));
    if (row.whatsapp_rate != null)     byType[ct].whatsapp.push(Number(row.whatsapp_rate));
    if (row.click_rate != null)        byType[ct].click.push(Number(row.click_rate));
  }

  function arrAvg(arr) {
    if (!arr.length) return null;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 1000) / 1000;
  }

  const content_type_stats = Object.entries(byType).map(([ct, d]) => ({
    content_type:             ct,
    sample_size:              d.scores.length,
    avg_performance_score:    arrAvg(d.scores),
    avg_intent_rate:          arrAvg(d.intent),
    avg_whatsapp_rate:        arrAvg(d.whatsapp),
    avg_click_rate:           arrAvg(d.click),
  }));

  // Per-item recommendations
  const byItem = {};
  for (const row of perfRows) {
    const id = row.content_item_id;
    if (!byItem[id]) byItem[id] = { content_type: row.content_type, subject_id: row.subject_id, scores: [], days: new Set() };
    if (row.performance_score != null) byItem[id].scores.push(Number(row.performance_score));
    byItem[id].days.add(row.recorded_date);
  }

  const allScores = Object.values(byItem).flatMap(b => b.scores).sort((a, b) => a - b);
  const p70idx    = Math.floor(allScores.length * 0.70);
  const p30idx    = Math.floor(allScores.length * 0.30);
  const p70       = allScores[Math.min(p70idx, allScores.length - 1)] ?? 0.5;
  const p30       = allScores[Math.min(p30idx, allScores.length - 1)] ?? 0.2;

  const item_recommendations = [];
  const decisions_map = {};

  for (const [id, data] of Object.entries(byItem)) {
    const days_observed = data.days.size;
    const item_avg      = arrAvg(data.scores);

    let recommendation, reason;
    if (item_avg == null) {
      recommendation = "insufficient_data";
      reason = "No scored rows — views likely below MIN_IMPRESSIONS.";
    } else if (item_avg >= p70) {
      recommendation = "repeat";
      reason = `Avg ${item_avg} ≥ p70 (${p70}). Strong performer.`;
    } else if (item_avg <= p30 && days_observed >= MIN_DAYS_STOP) {
      recommendation = "stop";
      reason = `Avg ${item_avg} ≤ p30 (${p30}) after ${days_observed} days. Low ROI.`;
    } else if (item_avg <= p30) {
      recommendation = "neutral";
      reason = `Below p30 but only ${days_observed} day(s) observed. Need ${MIN_DAYS_STOP}.`;
    } else {
      recommendation = "neutral";
      reason = `Between p30/p70. Continue observing.`;
    }

    item_recommendations.push({ content_item_id: id, content_type: data.content_type, subject_id: data.subject_id, days_observed, avg_score: item_avg, recommendation, reason });
    decisions_map[id] = { content_type: data.content_type, recommendation, avg_score: item_avg, updated_at: new Date().toISOString() };
  }

  // Rejection patterns
  const { rows: rejRows } = await client.query(
    `
    SELECT rejection_reason, COUNT(*)::int AS count
    FROM ai_content_reviews
    WHERE action = 'rejected'
      AND created_at >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
      AND rejection_reason IS NOT NULL
    GROUP BY rejection_reason ORDER BY count DESC LIMIT 20
    `
  );
  const totalRej = rejRows.reduce((s, r) => s + r.count, 0);
  const rejection_patterns = rejRows.map(r => ({
    rejection_reason: r.rejection_reason,
    count: r.count,
    pct_of_total: totalRej > 0 ? Math.round(r.count / totalRej * 1000) / 10 : 0,
  }));

  // Edit rate
  const { rows: editRows } = await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE was_edited)::int AS edited
     FROM ai_content_reviews WHERE created_at >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'`
  );
  const totalRev = editRows[0]?.total || 0;
  const totalEd  = editRows[0]?.edited || 0;

  const top_performers = item_recommendations
    .filter(r => r.avg_score != null)
    .sort((a, b) => b.avg_score - a.avg_score)
    .slice(0, 5);

  const worst_performers = item_recommendations
    .filter(r => r.avg_score != null && r.days_observed >= MIN_DAYS_STOP)
    .sort((a, b) => a.avg_score - b.avg_score)
    .slice(0, 5);

  return {
    report: {
      generated_at:      new Date().toISOString(),
      lookback_days:     LOOKBACK_DAYS,
      date_from:         dateFrom,
      date_to:           dateTo,
      content_type_stats,
      item_recommendations,
      rejection_patterns,
      edit_rate: {
        total_reviewed: totalRev,
        total_edited:   totalEd,
        edit_rate:      totalRev > 0 ? Math.round(totalEd / totalRev * 1000) / 10 : 0,
      },
      top_performers,
      worst_performers,
    },
    decisions_map,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== CONTENT PERFORMANCE ROLLUP ===\n");

  const client = createClient();
  await client.connect();

  try {
    // Step 1: Aggregate yesterday's events
    const targetDate = yesterday();
    await aggregateDay(client, targetDate);

    // Step 2: Build learning report for last 7 days
    const { report, decisions_map } = await buildLearningReport(client);

    // Write full report artifact
    const artifactPath = path.join(artifactsDir, `content-learning-${targetDate}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n[learning] Artifact written: ${artifactPath}`);

    // Write decisions memory file (overwrite — always reflects latest state)
    const decisionsPath = path.join(memoryDir, "content-decisions.json");
    fs.writeFileSync(
      decisionsPath,
      JSON.stringify({ updated_at: new Date().toISOString(), decisions: decisions_map }, null, 2),
      "utf8"
    );
    console.log(`[learning] Decisions memory written: ${decisionsPath}`);

    // Summary to stdout
    const repeatCount = Object.values(decisions_map).filter(d => d.recommendation === "repeat").length;
    const stopCount   = Object.values(decisions_map).filter(d => d.recommendation === "stop").length;
    console.log(`\n[summary] repeat=${repeatCount} stop=${stopCount} total_items=${Object.keys(decisions_map).length}`);
    console.log(`[summary] edit_rate=${report.edit_rate.edit_rate}%  top_performers=${report.top_performers.length}`);

  } finally {
    await client.end();
  }

  console.log("\n=== CONTENT PERFORMANCE ROLLUP DONE ===\n");
}

main().catch((err) => {
  console.error("[rollup] Fatal error:", err.message);
  process.exit(1);
});
