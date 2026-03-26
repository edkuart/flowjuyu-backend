// src/services/content/TemplatePerformanceService.ts
//
// Computes performance metrics for each template and writes them back to
// ai_content_templates. Called by the nightly adaptation runner.
//
// Metrics tracked per template (identified by slug = variants.template_id):
//   sample_count          — total variants using this template
//   generation_score_avg  — avg quality-at-generation-time score
//   performance_score_avg — avg real-world performance score (from daily table)
//   rejection_rate        — (rejected + discarded + guardrail_failed) / total
//   edit_rate             — edited_and_approved / total approved
//
// MIN_SAMPLES = 5: metrics are only written when sample_count >= 5.
// Below this threshold the stats are left as NULL to avoid noisy signals.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";
import AiContentTemplate from "../../models/AiContentTemplate.model";

const MIN_SAMPLES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateStats {
  slug:                 string;
  sample_count:         number;
  generation_score_avg: number | null;
  performance_score_avg: number | null;
  rejection_rate:       number | null;
  edit_rate:            number | null;
}

// ─── Compute stats for all templates ─────────────────────────────────────────

export async function computeTemplateStats(): Promise<TemplateStats[]> {
  const rows = await sequelize.query<{
    slug:                string;
    sample_count:        string;
    avg_gen_score:       string | null;
    avg_perf_score:      string | null;
    rejected_count:      string;
    approved_count:      string;
    edited_count:        string;
  }>(
    `
    SELECT
      v.template_id                                                           AS slug,
      COUNT(v.id)::text                                                       AS sample_count,
      AVG(v.generation_score)::text                                           AS avg_gen_score,
      AVG(p.performance_score)::text                                          AS avg_perf_score,
      COUNT(v.id) FILTER (
        WHERE v.status IN ('rejected', 'discarded', 'guardrail_failed')
      )::text                                                                 AS rejected_count,
      COUNT(v.id) FILTER (
        WHERE v.status IN ('approved', 'edited_and_approved', 'published')
      )::text                                                                 AS approved_count,
      COUNT(v.id) FILTER (
        WHERE v.status = 'edited_and_approved'
      )::text                                                                 AS edited_count
    FROM ai_content_variants v
    LEFT JOIN ai_content_performance_daily p ON p.content_variant_id = v.id
    GROUP BY v.template_id
    `,
    { type: QueryTypes.SELECT }
  );

  return rows.map((r) => {
    const n         = Number(r.sample_count) || 0;
    const rejected  = Number(r.rejected_count) || 0;
    const approved  = Number(r.approved_count) || 0;
    const edited    = Number(r.edited_count) || 0;

    if (n < MIN_SAMPLES) {
      return {
        slug:                 r.slug,
        sample_count:         n,
        generation_score_avg: null,
        performance_score_avg: null,
        rejection_rate:       null,
        edit_rate:            null,
      };
    }

    return {
      slug:                 r.slug,
      sample_count:         n,
      generation_score_avg: r.avg_gen_score != null
        ? Math.round(Number(r.avg_gen_score) * 1000) / 1000
        : null,
      performance_score_avg: r.avg_perf_score != null
        ? Math.round(Number(r.avg_perf_score) * 1000) / 1000
        : null,
      rejection_rate: n > 0
        ? Math.round((rejected / n) * 1000) / 1000
        : null,
      edit_rate: approved > 0
        ? Math.round((edited / approved) * 1000) / 1000
        : null,
    };
  });
}

// ─── Write stats back to the templates table ─────────────────────────────────

export async function refreshTemplateStats(): Promise<{
  updated:  number;
  skipped:  number;
  missing:  string[];
}> {
  const stats    = await computeTemplateStats();
  let updated    = 0;
  let skipped    = 0;
  const missing: string[] = [];

  for (const stat of stats) {
    const template = await AiContentTemplate.findOne({
      where: { slug: stat.slug },
    });

    if (!template) {
      missing.push(stat.slug);
      continue;
    }

    // Don't overwrite if still below MIN_SAMPLES (keep existing stats)
    if (stat.generation_score_avg === null && template.sample_count >= MIN_SAMPLES) {
      skipped++;
      continue;
    }

    await template.update({
      sample_count:          stat.sample_count,
      generation_score_avg:  stat.generation_score_avg,
      performance_score_avg: stat.performance_score_avg,
      rejection_rate:        stat.rejection_rate,
      edit_rate:             stat.edit_rate,
    });

    updated++;
  }

  return { updated, skipped, missing };
}
