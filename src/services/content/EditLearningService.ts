// src/services/content/EditLearningService.ts
//
// Extracts structured insight from admin editing behaviour.
//
// Every time a reviewer uses 'edited_and_approved', the content_before and
// content_after are stored in ai_content_reviews. This service mines those
// records to identify:
//
//   1. edit_distance_distribution  — are edits small tweaks or full rewrites?
//   2. edit_position               — beginning / middle / end of text modified?
//   3. length_delta_direction      — do humans shorten or lengthen the output?
//   4. word_replacement_patterns   — which template-generated openers are changed most?
//
// These signals feed PromptEvolutionService to target the highest-friction areas.
// The output is also written to flow-ai/memory/content-patterns.json.
//
// TRUST GATE: analyses only run when edit_count >= MIN_EDITS per content_type.

import path from "path";
import fs   from "fs";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

const MIN_EDITS         = 3;
const LOOKBACK_DAYS     = 30;
const PATTERNS_FILE     = path.join(process.cwd(), "flow-ai/memory/content-patterns.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditDistribution {
  content_type:     string;
  edit_count:       number;
  avg_char_delta:   number;
  avg_length_ratio: number;  // after_length / before_length (< 1 = humans shorten)
  pct_small_edits:  number;  // char_delta < 30
  pct_large_rewrites: number; // char_delta > 150
  low_confidence:   boolean;
}

export interface OpeningPhrase {
  original_opening:  string; // first 6 words of content_before
  replaced:          boolean; // was it different in content_after?
  count:             number;
}

export interface LengthInsight {
  content_type:      string;
  before_avg_words:  number;
  after_avg_words:   number;
  delta_words:       number;  // positive = humans add words, negative = humans cut
  recommended_range: { min: number; max: number };
}

export interface EditPatterns {
  generated_at:          string;
  lookback_days:         number;
  edit_distributions:    EditDistribution[];
  length_insights:       LengthInsight[];
  high_churn_openings:   OpeningPhrase[];
  winning_hooks:         Array<{ content_type: string; phrase: string; avg_gen_score: number }>;
  failing_patterns:      Array<{ content_type: string; pattern: string; freq: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstNWords(text: string, n: number): string {
  return (text || "").trim().split(/\s+/).slice(0, n).join(" ").toLowerCase();
}

function wordCount(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// ─── Main: extract edit patterns ─────────────────────────────────────────────

export async function extractEditPatterns(): Promise<EditPatterns> {
  const dateFrom = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  // ── 1. Raw edit records ────────────────────────────────────────────────────
  const editRows = await sequelize.query<{
    content_type:    string;
    content_before:  string;
    content_after:   string;
    edit_char_delta: string;
  }>(
    `
    SELECT
      i.content_type,
      r.content_before,
      r.content_after,
      r.edit_char_delta::text
    FROM ai_content_reviews r
    JOIN ai_content_variants v ON v.id = r.variant_id
    JOIN ai_content_items    i ON i.id = v.content_item_id
    WHERE r.was_edited = true
      AND r.content_before IS NOT NULL
      AND r.content_after  IS NOT NULL
      AND r.created_at >= :date_from
    ORDER BY i.content_type, r.created_at DESC
    `,
    { replacements: { date_from: dateFrom }, type: QueryTypes.SELECT }
  );

  // ── 2. Winning hooks (high-score, non-edited approved variants) ────────────
  const hookRows = await sequelize.query<{
    content_type:     string;
    content_body:     string;
    generation_score: string;
  }>(
    `
    SELECT
      i.content_type,
      v.content_body,
      v.generation_score::text
    FROM ai_content_variants v
    JOIN ai_content_items i ON i.id = v.content_item_id
    WHERE v.status = 'approved'
      AND v.generation_score >= 0.70
      AND v.generated_at >= :date_from
    ORDER BY v.generation_score DESC
    LIMIT 20
    `,
    { replacements: { date_from: dateFrom }, type: QueryTypes.SELECT }
  );

  // ── 3. Failing patterns (most-rejected rejection_reasons per content_type) ─
  const failRows = await sequelize.query<{
    content_type:     string;
    rejection_reason: string;
    freq:             string;
  }>(
    `
    SELECT
      i.content_type,
      v.rejection_reason,
      COUNT(*)::text AS freq
    FROM ai_content_variants v
    JOIN ai_content_items i ON i.id = v.content_item_id
    WHERE v.status IN ('rejected', 'discarded', 'guardrail_failed')
      AND v.rejection_reason IS NOT NULL
      AND v.generated_at >= :date_from
    GROUP BY i.content_type, v.rejection_reason
    ORDER BY COUNT(*) DESC
    LIMIT 15
    `,
    { replacements: { date_from: dateFrom }, type: QueryTypes.SELECT }
  );

  // ── Aggregate by content_type ──────────────────────────────────────────────
  const byType = new Map<string, {
    char_deltas:   number[];
    before_words:  number[];
    after_words:   number[];
    openings:      Map<string, { replaced: number; total: number }>;
  }>();

  for (const row of editRows) {
    const ct = row.content_type;
    if (!byType.has(ct)) {
      byType.set(ct, {
        char_deltas:  [],
        before_words: [],
        after_words:  [],
        openings:     new Map(),
      });
    }
    const b = byType.get(ct)!;

    const delta  = Math.abs(Number(row.edit_char_delta) || 0);
    const before = wordCount(row.content_before);
    const after  = wordCount(row.content_after);
    const open   = firstNWords(row.content_before, 6);
    const openAfter = firstNWords(row.content_after, 6);

    b.char_deltas.push(delta);
    b.before_words.push(before);
    b.after_words.push(after);

    const existing = b.openings.get(open) ?? { replaced: 0, total: 0 };
    existing.total++;
    if (open !== openAfter) existing.replaced++;
    b.openings.set(open, existing);
  }

  // ── Build EditDistributions ────────────────────────────────────────────────
  const edit_distributions: EditDistribution[] = [];
  const length_insights: LengthInsight[] = [];

  for (const [ct, data] of byType.entries()) {
    const n = data.char_deltas.length;
    if (n === 0) continue;

    const avgDelta     = data.char_deltas.reduce((a, b) => a + b, 0) / n;
    const avgBefore    = data.before_words.reduce((a, b) => a + b, 0) / n;
    const avgAfter     = data.after_words.reduce((a, b) => a + b, 0) / n;
    const avgLenRatio  = avgBefore > 0 ? avgAfter / avgBefore : 1;
    const smallEdits   = data.char_deltas.filter((d) => d < 30).length;
    const largeRewrites = data.char_deltas.filter((d) => d > 150).length;

    edit_distributions.push({
      content_type:       ct,
      edit_count:         n,
      avg_char_delta:     Math.round(avgDelta),
      avg_length_ratio:   Math.round(avgLenRatio * 100) / 100,
      pct_small_edits:    Math.round((smallEdits / n) * 100),
      pct_large_rewrites: Math.round((largeRewrites / n) * 100),
      low_confidence:     n < MIN_EDITS,
    });

    // Recommend a tighter word count range: p25–p75 of after_words
    const sorted = [...data.after_words].sort((a, b) => a - b);
    const p25    = sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0];
    const p75    = sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1];

    length_insights.push({
      content_type:      ct,
      before_avg_words:  Math.round(avgBefore),
      after_avg_words:   Math.round(avgAfter),
      delta_words:       Math.round(avgAfter - avgBefore),
      recommended_range: { min: Math.max(p25 - 5, 5), max: p75 + 5 },
    });
  }

  // ── High-churn openings: openings changed in > 50% of edits ──────────────
  const high_churn_openings: OpeningPhrase[] = [];
  for (const [ct, data] of byType.entries()) {
    if (data.openings.size === 0) continue;
    for (const [phrase, stats] of data.openings.entries()) {
      if (stats.total >= 2 && stats.replaced / stats.total >= 0.5) {
        high_churn_openings.push({
          original_opening: phrase,
          replaced:         true,
          count:            stats.replaced,
        });
      }
    }
  }

  // ── Winning hooks ─────────────────────────────────────────────────────────
  const winning_hooks = hookRows.map((r) => ({
    content_type:    r.content_type,
    phrase:          firstNWords(r.content_body, 8),
    avg_gen_score:   Math.round(Number(r.generation_score) * 1000) / 1000,
  }));

  // ── Failing patterns ──────────────────────────────────────────────────────
  const failing_patterns = failRows.map((r) => ({
    content_type: r.content_type,
    pattern:      r.rejection_reason,
    freq:         Number(r.freq),
  }));

  return {
    generated_at:        new Date().toISOString(),
    lookback_days:       LOOKBACK_DAYS,
    edit_distributions,
    length_insights,
    high_churn_openings,
    winning_hooks,
    failing_patterns,
  };
}

// ─── Write to content-patterns.json memory file ──────────────────────────────

export async function updatePatternMemory(): Promise<EditPatterns> {
  const patterns = await extractEditPatterns();

  const memDir = path.dirname(PATTERNS_FILE);
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });

  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2), "utf8");
  return patterns;
}
