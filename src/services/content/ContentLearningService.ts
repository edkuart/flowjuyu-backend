// src/services/content/ContentLearningService.ts
//
// Reads the last 7 days of performance data and produces:
//   1. A structured LearningReport (returned as JSON)
//   2. Per-item repeat/stop recommendations based on p70/p30 score thresholds
//
// Rules:
//   - Minimum 3 days observed before a 'stop' recommendation is issued.
//   - p70 threshold → 'repeat' (content type worth generating more of)
//   - p30 threshold → 'stop' (content type underperforming; skip next cycle)
//   - 'neutral' when between p30/p70 or insufficient data.
//
// This service is pure analysis — it does NOT update any DB records.
// The runner writes the output as a JSON artifact for admin visibility.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

const LOOKBACK_DAYS = 7;
const MIN_DAYS_FOR_STOP = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentTypeStats {
  content_type: string;
  sample_size: number;              // number of (item, date) pairs observed
  avg_performance_score: number | null;
  median_performance_score: number | null;
  avg_intent_rate: number | null;
  avg_whatsapp_rate: number | null;
  avg_click_rate: number | null;
}

export interface ItemRecommendation {
  content_item_id: string;
  content_type: string;
  subject_id: string;
  days_observed: number;
  avg_score: number | null;
  recommendation: "repeat" | "stop" | "neutral" | "insufficient_data";
  reason: string;
}

export interface RejectionPattern {
  rejection_reason: string;
  count: number;
  pct_of_total: number;
}

export interface EditRateStats {
  total_reviewed: number;
  total_edited: number;
  edit_rate: number;
}

export interface LearningReport {
  generated_at: string;
  lookback_days: number;
  date_from: string;
  date_to: string;
  content_type_stats: ContentTypeStats[];
  item_recommendations: ItemRecommendation[];
  rejection_patterns: RejectionPattern[];
  edit_rate: EditRateStats;
  top_performers: Array<{ content_item_id: string; content_type: string; avg_score: number }>;
  worst_performers: Array<{ content_item_id: string; content_type: string; avg_score: number; days_observed: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function avg(values: (number | null)[]): number | null {
  const clean = values.filter((v): v is number => v != null);
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function analyzeLast7Days(): Promise<LearningReport> {
  const now        = new Date();
  const dateTo     = now.toISOString().slice(0, 10);
  const dateFrom   = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // ── 1. Raw performance rows for the window ─────────────────────────────────
  const perfRows = await sequelize.query<{
    content_item_id: string;
    content_variant_id: string;
    content_type: string;
    subject_id: string;
    recorded_date: string;
    performance_score: string | null;
    intent_rate: string | null;
    whatsapp_rate: string | null;
    click_rate: string | null;
    views: number;
  }>(
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
    WHERE p.recorded_date BETWEEN :date_from AND :date_to
    ORDER BY p.content_item_id, p.recorded_date
    `,
    {
      replacements: { date_from: dateFrom, date_to: dateTo },
      type: QueryTypes.SELECT,
    }
  );

  // ── 2. Content-type aggregate stats ────────────────────────────────────────
  const byType = new Map<string, {
    scores: number[];
    intent_rates: number[];
    whatsapp_rates: number[];
    click_rates: number[];
  }>();

  for (const row of perfRows) {
    if (!byType.has(row.content_type)) {
      byType.set(row.content_type, { scores: [], intent_rates: [], whatsapp_rates: [], click_rates: [] });
    }
    const bucket = byType.get(row.content_type)!;
    if (row.performance_score != null) bucket.scores.push(Number(row.performance_score));
    if (row.intent_rate != null)       bucket.intent_rates.push(Number(row.intent_rate));
    if (row.whatsapp_rate != null)     bucket.whatsapp_rates.push(Number(row.whatsapp_rate));
    if (row.click_rate != null)        bucket.click_rates.push(Number(row.click_rate));
  }

  const content_type_stats: ContentTypeStats[] = [];
  for (const [content_type, data] of byType.entries()) {
    const sorted = [...data.scores].sort((a, b) => a - b);
    content_type_stats.push({
      content_type,
      sample_size:              data.scores.length,
      avg_performance_score:    avg(data.scores),
      median_performance_score: percentile(sorted, 0.5),
      avg_intent_rate:          avg(data.intent_rates),
      avg_whatsapp_rate:        avg(data.whatsapp_rates),
      avg_click_rate:           avg(data.click_rates),
    });
  }

  // ── 3. Per-item recommendations ────────────────────────────────────────────
  // Group rows by item, compute avg score, days observed
  const byItem = new Map<string, {
    content_type: string;
    subject_id: string;
    scores: number[];
    days: Set<string>;
  }>();

  for (const row of perfRows) {
    if (!byItem.has(row.content_item_id)) {
      byItem.set(row.content_item_id, {
        content_type: row.content_type,
        subject_id:   row.subject_id,
        scores:       [],
        days:         new Set(),
      });
    }
    const bucket = byItem.get(row.content_item_id)!;
    if (row.performance_score != null) bucket.scores.push(Number(row.performance_score));
    bucket.days.add(row.recorded_date);
  }

  // Compute global p70/p30 across all items with scores
  const allScores = [...byItem.values()]
    .flatMap((b) => b.scores)
    .filter((s) => s != null)
    .sort((a, b) => a - b);

  const p70 = percentile(allScores, 0.70) ?? 0.5;
  const p30 = percentile(allScores, 0.30) ?? 0.2;

  const item_recommendations: ItemRecommendation[] = [];

  for (const [content_item_id, data] of byItem.entries()) {
    const days_observed = data.days.size;
    const item_avg      = avg(data.scores);

    let recommendation: ItemRecommendation["recommendation"];
    let reason: string;

    if (item_avg == null || data.scores.length === 0) {
      recommendation = "insufficient_data";
      reason         = "No scored rows in window — views likely below MIN_IMPRESSIONS.";
    } else if (item_avg >= p70) {
      recommendation = "repeat";
      reason         = `Avg score ${item_avg.toFixed(3)} ≥ p70 (${p70.toFixed(3)}). Content resonating — generate next variant.`;
    } else if (item_avg <= p30 && days_observed >= MIN_DAYS_FOR_STOP) {
      recommendation = "stop";
      reason         = `Avg score ${item_avg.toFixed(3)} ≤ p30 (${p30.toFixed(3)}) after ${days_observed} days. Low ROI — skip next cycle.`;
    } else if (item_avg <= p30 && days_observed < MIN_DAYS_FOR_STOP) {
      recommendation = "neutral";
      reason         = `Score below p30 but only ${days_observed} day(s) observed. Need ${MIN_DAYS_FOR_STOP} days before stop decision.`;
    } else {
      recommendation = "neutral";
      reason         = `Avg score ${item_avg.toFixed(3)} between p30/p70 thresholds. Continue observing.`;
    }

    item_recommendations.push({
      content_item_id,
      content_type:  data.content_type,
      subject_id:    data.subject_id,
      days_observed,
      avg_score:     item_avg,
      recommendation,
      reason,
    });
  }

  // ── 4. Rejection patterns ──────────────────────────────────────────────────
  const rejectionRows = await sequelize.query<{
    rejection_reason: string;
    count: string;
  }>(
    `
    SELECT
      rejection_reason,
      COUNT(*)::text AS count
    FROM ai_content_reviews
    WHERE action = 'rejected'
      AND created_at >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
      AND rejection_reason IS NOT NULL
    GROUP BY rejection_reason
    ORDER BY COUNT(*) DESC
    LIMIT 20
    `,
    { type: QueryTypes.SELECT }
  );

  const totalRejections = rejectionRows.reduce((s, r) => s + Number(r.count), 0);
  const rejection_patterns: RejectionPattern[] = rejectionRows.map((r) => ({
    rejection_reason: r.rejection_reason,
    count:            Number(r.count),
    pct_of_total:     totalRejections > 0
      ? Math.round((Number(r.count) / totalRejections) * 1000) / 10
      : 0,
  }));

  // ── 5. Edit rate ───────────────────────────────────────────────────────────
  const editRows = await sequelize.query<{
    total_reviewed: string;
    total_edited: string;
  }>(
    `
    SELECT
      COUNT(*)                             AS total_reviewed,
      COUNT(*) FILTER (WHERE was_edited)   AS total_edited
    FROM ai_content_reviews
    WHERE created_at >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
    `,
    { type: QueryTypes.SELECT }
  );

  const totalReviewed = Number(editRows[0]?.total_reviewed ?? 0);
  const totalEdited   = Number(editRows[0]?.total_edited ?? 0);
  const edit_rate: EditRateStats = {
    total_reviewed: totalReviewed,
    total_edited:   totalEdited,
    edit_rate:      totalReviewed > 0
      ? Math.round((totalEdited / totalReviewed) * 1000) / 10
      : 0,
  };

  // ── 6. Top / worst performers ──────────────────────────────────────────────
  const top_performers = item_recommendations
    .filter((r) => r.avg_score != null)
    .sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0))
    .slice(0, 5)
    .map((r) => ({
      content_item_id: r.content_item_id,
      content_type:    r.content_type,
      avg_score:       r.avg_score as number,
    }));

  const worst_performers = item_recommendations
    .filter((r) => r.avg_score != null && r.days_observed >= MIN_DAYS_FOR_STOP)
    .sort((a, b) => (a.avg_score ?? 1) - (b.avg_score ?? 1))
    .slice(0, 5)
    .map((r) => ({
      content_item_id: r.content_item_id,
      content_type:    r.content_type,
      avg_score:       r.avg_score as number,
      days_observed:   r.days_observed,
    }));

  return {
    generated_at:        now.toISOString(),
    lookback_days:       LOOKBACK_DAYS,
    date_from:           dateFrom,
    date_to:             dateTo,
    content_type_stats,
    item_recommendations,
    rejection_patterns,
    edit_rate,
    top_performers,
    worst_performers,
  };
}
