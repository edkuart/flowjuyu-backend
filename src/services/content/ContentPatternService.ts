// src/services/content/ContentPatternService.ts
//
// Pattern reuse engine: extracts what works from approved/published variants
// and produces structured insight for generation targeting.
//
// Design principles:
//   - Read-only: never modifies generation prompts directly
//   - Explainable: every winning pattern has a source (variant_id + score)
//   - Exploration-safe: returns diversity metrics alongside winning patterns
//   - Trust-gated: patterns with fewer than MIN_SAMPLES samples are flagged as
//     low-confidence and excluded from exploitation bias
//
// What "patterns" means here:
//   - Word count ranges that correlate with high scores
//   - Content types ranked by avg generation + performance score
//   - Opening phrases (first 8 words) from top-scoring variants
//   - Rejection reason frequencies (what to avoid)
//
// Phase 4 usage:
//   The runner reads patterns to annotate the generation queue with
//   "winning context" that operators can inspect. Generation itself is
//   unchanged — patterns are ADVISORY, not programmatic constraints.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

const MIN_SAMPLES = 3; // below this, patterns are low-confidence

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentTypePerformance {
  content_type:          string;
  sample_count:          number;
  avg_generation_score:  number | null;
  avg_performance_score: number | null;
  approval_rate:         number | null;
  edit_rate:             number | null;
  low_confidence:        boolean;
}

export interface WordCountRange {
  content_type: string;
  p25_words:    number;
  median_words: number;
  p75_words:    number;
  sample_count: number;
}

export interface WinningHook {
  content_type:      string;
  opening_phrase:    string;   // first 8 words
  variant_id:        string;
  generation_score:  number;
  performance_score: number | null;
}

export interface RejectionPattern {
  rejection_reason: string;
  count:            number;
  pct_of_total:     number;
}

export interface ExplorationSignal {
  content_type:           string;
  coverage_pct:           number;  // % of products that have this type published
  avg_performance_score:  number | null;
  recommendation:         "increase_exploration" | "maintain" | "reduce_exploration";
  reason:                 string;
}

export interface ContentPatterns {
  generated_at:           string;
  lookback_days:          number;
  content_type_rankings:  ContentTypePerformance[];
  word_count_ranges:      WordCountRange[];
  winning_hooks:          WinningHook[];
  rejection_patterns:     RejectionPattern[];
  exploration_signals:    ExplorationSignal[];
  diversity_health:       { score: number; status: "healthy" | "at_risk" | "over_exploited" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstNWords(text: string, n: number): string {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function computeDiversityHealth(signals: ExplorationSignal[]): ContentPatterns["diversity_health"] {
  if (signals.length === 0) return { score: 0.5, status: "healthy" };

  const overExploitedCount = signals.filter(
    (s) => s.recommendation === "reduce_exploration"
  ).length;

  const underCoveredCount = signals.filter(
    (s) => s.recommendation === "increase_exploration"
  ).length;

  if (overExploitedCount > signals.length * 0.6) {
    return { score: 0.30, status: "over_exploited" };
  }
  if (underCoveredCount > signals.length * 0.6) {
    return { score: 0.40, status: "at_risk" };
  }
  return { score: 0.80, status: "healthy" };
}

// ─── Main: extract patterns ───────────────────────────────────────────────────

export async function extractPatterns(lookbackDays = 14): Promise<ContentPatterns> {
  const dateFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // ── 1. Content-type performance rankings ───────────────────────────────────
  const typeRows = await sequelize.query<{
    content_type:          string;
    sample_count:          string;
    avg_gen_score:         string | null;
    avg_perf_score:        string | null;
    approved_count:        string;
    edited_count:          string;
    total_reviewed:        string;
  }>(
    `
    SELECT
      i.content_type,
      COUNT(DISTINCT v.id)::text                                   AS sample_count,
      AVG(v.generation_score)::text                                AS avg_gen_score,
      AVG(p.performance_score)::text                               AS avg_perf_score,
      COUNT(DISTINCT r.id) FILTER (WHERE r.action IN ('approved','edited_and_approved'))::text AS approved_count,
      COUNT(DISTINCT r.id) FILTER (WHERE r.was_edited = true)::text AS edited_count,
      COUNT(DISTINCT r.id)::text                                   AS total_reviewed
    FROM ai_content_items i
    JOIN ai_content_variants v    ON v.content_item_id = i.id
    LEFT JOIN ai_content_reviews r ON r.variant_id = v.id
    LEFT JOIN ai_content_performance_daily p
      ON p.content_item_id = i.id
      AND p.recorded_date >= :date_from
    WHERE v.generated_at >= :date_from
    GROUP BY i.content_type
    ORDER BY AVG(v.generation_score) DESC NULLS LAST
    `,
    {
      replacements: { date_from: dateFrom },
      type: QueryTypes.SELECT,
    }
  );

  const content_type_rankings: ContentTypePerformance[] = typeRows.map((r) => {
    const n = Number(r.sample_count) || 0;
    const reviewed = Number(r.total_reviewed) || 0;
    return {
      content_type:         r.content_type,
      sample_count:         n,
      avg_generation_score: r.avg_gen_score != null ? Math.round(Number(r.avg_gen_score) * 1000) / 1000 : null,
      avg_performance_score: r.avg_perf_score != null ? Math.round(Number(r.avg_perf_score) * 1000) / 1000 : null,
      approval_rate:         reviewed > 0 ? Math.round((Number(r.approved_count) / reviewed) * 1000) / 10 : null,
      edit_rate:             reviewed > 0 ? Math.round((Number(r.edited_count) / reviewed) * 1000) / 10 : null,
      low_confidence:        n < MIN_SAMPLES,
    };
  });

  // ── 2. Word count ranges for approved/published variants ──────────────────
  const wcRows = await sequelize.query<{
    content_type: string;
    word_count:   string;
  }>(
    `
    SELECT
      i.content_type,
      v.word_count::text AS word_count
    FROM ai_content_variants v
    JOIN ai_content_items i ON i.id = v.content_item_id
    WHERE v.status IN ('approved', 'edited_and_approved', 'published')
      AND v.word_count IS NOT NULL
      AND v.word_count > 0
      AND v.generated_at >= :date_from
    ORDER BY i.content_type, v.word_count
    `,
    { replacements: { date_from: dateFrom }, type: QueryTypes.SELECT }
  );

  // Group by content_type and compute percentiles
  const wcByType = new Map<string, number[]>();
  for (const r of wcRows) {
    const ct = r.content_type;
    if (!wcByType.has(ct)) wcByType.set(ct, []);
    wcByType.get(ct)!.push(Number(r.word_count));
  }

  const word_count_ranges: WordCountRange[] = [];
  for (const [ct, counts] of wcByType.entries()) {
    if (counts.length === 0) continue;
    const sorted = [...counts].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0];
    const med = sorted[Math.floor(sorted.length * 0.50)] ?? sorted[0];
    const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1];
    word_count_ranges.push({
      content_type: ct,
      p25_words:    p25,
      median_words: med,
      p75_words:    p75,
      sample_count: sorted.length,
    });
  }

  // ── 3. Winning hooks from top-scoring approved variants ───────────────────
  const hookRows = await sequelize.query<{
    content_type:      string;
    variant_id:        string;
    content_body:      string;
    generation_score:  string;
    performance_score: string | null;
  }>(
    `
    SELECT
      i.content_type,
      v.id AS variant_id,
      v.content_body,
      v.generation_score::text,
      p.performance_score::text
    FROM ai_content_variants v
    JOIN ai_content_items i ON i.id = v.content_item_id
    LEFT JOIN ai_content_performance_daily p
      ON p.content_variant_id = v.id
      AND p.recorded_date >= :date_from
    WHERE v.status IN ('approved', 'edited_and_approved', 'published')
      AND v.generation_score >= 0.65
      AND v.generated_at >= :date_from
    ORDER BY v.generation_score DESC NULLS LAST
    LIMIT 15
    `,
    { replacements: { date_from: dateFrom }, type: QueryTypes.SELECT }
  );

  const winning_hooks: WinningHook[] = hookRows.map((r) => ({
    content_type:     r.content_type,
    opening_phrase:   firstNWords(r.content_body, 8),
    variant_id:       r.variant_id,
    generation_score: Math.round(Number(r.generation_score) * 1000) / 1000,
    performance_score: r.performance_score != null
      ? Math.round(Number(r.performance_score) * 1000) / 1000
      : null,
  }));

  // ── 4. Rejection patterns ─────────────────────────────────────────────────
  const rejRows = await sequelize.query<{
    rejection_reason: string;
    count:            string;
  }>(
    `
    SELECT rejection_reason, COUNT(*)::text AS count
    FROM ai_content_variants
    WHERE status IN ('rejected', 'guardrail_failed', 'discarded')
      AND rejection_reason IS NOT NULL
      AND generated_at >= :date_from
    GROUP BY rejection_reason
    ORDER BY COUNT(*) DESC
    LIMIT 10
    `,
    { replacements: { date_from: dateFrom }, type: QueryTypes.SELECT }
  );

  const totalRejected = rejRows.reduce((s, r) => s + Number(r.count), 0);
  const rejection_patterns: RejectionPattern[] = rejRows.map((r) => ({
    rejection_reason: r.rejection_reason,
    count:            Number(r.count),
    pct_of_total:     totalRejected > 0
      ? Math.round((Number(r.count) / totalRejected) * 1000) / 10
      : 0,
  }));

  // ── 5. Exploration signals ─────────────────────────────────────────────────
  const contentTypes = ["caption", "product_description", "image_prompt_brief"];

  const coverageRows = await sequelize.query<{
    content_type:   string;
    total_published: string;
    total_products:  string;
  }>(
    `
    SELECT
      i.content_type,
      COUNT(DISTINCT i.subject_id) FILTER (WHERE i.status = 'published')::text AS total_published,
      (SELECT COUNT(*) FROM productos WHERE activo = true)::text                AS total_products
    FROM ai_content_items i
    WHERE i.subject_type = 'product'
    GROUP BY i.content_type
    `,
    { type: QueryTypes.SELECT }
  );

  const coverageMap = new Map(coverageRows.map((r) => [r.content_type, r]));

  const exploration_signals: ExplorationSignal[] = contentTypes.map((ct) => {
    const cr = coverageMap.get(ct);
    const totalProducts = cr ? Number(cr.total_products) : 0;
    const published     = cr ? Number(cr.total_published) : 0;
    const pct           = totalProducts > 0 ? Math.round((published / totalProducts) * 1000) / 10 : 0;

    const typeRanking = content_type_rankings.find((r) => r.content_type === ct);
    const avgPerf     = typeRanking?.avg_performance_score ?? null;

    let recommendation: ExplorationSignal["recommendation"];
    let reason: string;

    if (pct < 20) {
      recommendation = "increase_exploration";
      reason         = `Only ${pct}% of products have published ${ct}. Expand coverage.`;
    } else if (pct > 80 && avgPerf != null && avgPerf > 0.55) {
      recommendation = "reduce_exploration";
      reason         = `${pct}% coverage with strong avg score (${avgPerf}). Exploit existing patterns.`;
    } else {
      recommendation = "maintain";
      reason         = `${pct}% coverage, avg score ${avgPerf ?? "n/a"}. Balanced state.`;
    }

    return {
      content_type:          ct,
      coverage_pct:          pct,
      avg_performance_score: avgPerf,
      recommendation,
      reason,
    };
  });

  return {
    generated_at:          new Date().toISOString(),
    lookback_days:         lookbackDays,
    content_type_rankings,
    word_count_ranges,
    winning_hooks,
    rejection_patterns,
    exploration_signals,
    diversity_health:      computeDiversityHealth(exploration_signals),
  };
}
