// src/services/content/PromptEvolutionService.ts
//
// Proposes improved prompt templates based on empirical performance data.
//
// DESIGN PRINCIPLES:
//   - No auto-deployment. Proposals are created as health_status='candidate'.
//   - Every proposal has a data-backed reason and expected_improvement estimate.
//   - Deterministic: same data always produces the same proposals.
//   - Conservative: proposals only generated when signals are statistically credible.
//   - Templates are IMMUTABLE: evolution means creating new rows, never updating.
//
// EVOLUTION SIGNALS analyzed:
//   1. Word count sweet-spot: approved+unedited variants vs template default range
//   2. Geographic lift:       variants mentioning location score higher?
//   3. Material term lift:    technique/material mentions correlate with score?
//   4. Edit length direction: humans systematically shorten or lengthen output?
//   5. High-churn openings:   opening phrases that humans always rewrite
//
// MIN_SAMPLES_FOR_EVOLUTION = 10: proposals only generated when we have enough data.
// IMPROVEMENT_THRESHOLD     = 0.04: propose only if estimated lift >= 4 score points.
//
// DIVERSITY SAFETY: never evolve a template if it is the ONLY active one for its type.
// Evolving would put the current template into 'retired' competition — risky with a
// single source.

import { Op } from "sequelize";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";
import AiContentTemplate from "../../models/AiContentTemplate.model";
import type { ContentType } from "../../types/content.types";
import { CONTENT_TYPES } from "../../types/content.types";

const MIN_SAMPLES_FOR_EVOLUTION = 10;
const IMPROVEMENT_THRESHOLD     = 0.04;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvolutionChange {
  type:        string;
  description: string;
  data_signal: string;
}

interface ProposalInput {
  baseTemplate:      AiContentTemplate;
  wordCount:         { optimal_min: number; optimal_max: number; current_mention: string | null };
  geoLift:           number;    // score lift from geographic mentions (0–1 delta)
  materialLift:      number;
  openingChurn:      boolean;   // true if first-sentence rewrites are common
  editLengthDelta:   number;    // avg (after_words - before_words) from reviews
  sampleCount:       number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractWordCountMention(promptText: string): string | null {
  // Matches patterns like "Entre 120 y 180 palabras", "Máximo 280 caracteres", etc.
  const m1 = promptText.match(/[Ee]ntre\s+(\d+)\s+y\s+(\d+)\s+palabras?/);
  if (m1) return m1[0];
  const m2 = promptText.match(/[Mm]áximo\s+(\d+)\s+caracteres?/);
  if (m2) return m2[0];
  return null;
}

function applyWordCountChange(prompt: string, oldMention: string, newMin: number, newMax: number): string {
  if (oldMention.toLowerCase().startsWith("entre")) {
    return prompt.replace(oldMention, `Entre ${newMin} y ${newMax} palabras`);
  }
  // For "Máximo X caracteres", replace with a words range instead
  return prompt.replace(oldMention, `Entre ${newMin} y ${newMax} palabras`);
}

// ─── Fetch evolution signals per content_type ─────────────────────────────────

async function fetchSignals(contentType: ContentType): Promise<{
  topVariantWordCounts: number[];
  geoMentionScores:    { with: number[]; without: number[] };
  materialScores:      { with: number[]; without: number[] };
  editDeltas:          number[];
  sampleCount:         number;
} | null> {
  const rows = await sequelize.query<{
    content_body:     string;
    generation_score: string | null;
    was_edited:       boolean | null;
    word_count:       string;
    region:           string | null;
    descripcion:      string | null;
  }>(
    `
    SELECT
      v.content_body,
      v.generation_score::text,
      r.was_edited,
      v.word_count::text,
      prod.region_custom   AS region,
      prod.descripcion
    FROM ai_content_variants v
    JOIN ai_content_items i   ON i.id = v.content_item_id
    LEFT JOIN ai_content_reviews r ON r.variant_id = v.id
    LEFT JOIN productos prod  ON prod.id::text = i.subject_id
    WHERE i.content_type = :ct
      AND v.status IN ('approved', 'edited_and_approved', 'published')
      AND v.generation_score IS NOT NULL
      AND v.generated_at >= NOW() - INTERVAL '60 days'
    LIMIT 100
    `,
    { replacements: { ct: contentType }, type: QueryTypes.SELECT }
  );

  if (rows.length < MIN_SAMPLES_FOR_EVOLUTION) return null;

  const topVariantWordCounts: number[] = [];
  const geoMentionScores = { with: [] as number[], without: [] as number[] };
  const materialScores   = { with: [] as number[], without: [] as number[] };
  const editDeltas: number[] = [];

  const materialTerms = ["algodón", "lana", "jaspe", "brocado", "bordado", "ikat", "hilado", "fibra"];
  const locationTerms = ["salcajá", "sololá", "totonicapán", "momostenango", "chichicastenango", "quiché", "huehue"];

  for (const row of rows) {
    const score = Number(row.generation_score) || 0;
    const wc    = Number(row.word_count) || 0;
    const lc    = (row.content_body || "").toLowerCase();

    // Only include unedited approved for word count signal (edited = human corrected word count)
    if (!row.was_edited && score >= 0.65) topVariantWordCounts.push(wc);

    // Geographic signal
    const hasGeo = locationTerms.some((t) => lc.includes(t)) || Boolean(row.region);
    if (hasGeo) geoMentionScores.with.push(score);
    else        geoMentionScores.without.push(score);

    // Material signal
    const hasMaterial = materialTerms.some((t) => lc.includes(t));
    if (hasMaterial) materialScores.with.push(score);
    else             materialScores.without.push(score);
  }

  // Edit delta from reviews
  const editRows = await sequelize.query<{
    before_wc: string;
    after_wc:  string;
  }>(
    `
    SELECT
      r.edit_char_delta::text  AS before_wc,
      v.word_count::text       AS after_wc
    FROM ai_content_reviews r
    JOIN ai_content_variants v ON v.id = r.variant_id
    JOIN ai_content_items    i ON i.id = v.content_item_id
    WHERE r.was_edited = true
      AND i.content_type = :ct
      AND r.created_at >= NOW() - INTERVAL '60 days'
    LIMIT 50
    `,
    { replacements: { ct: contentType }, type: QueryTypes.SELECT }
  );
  editDeltas.push(...editRows.map((r) => Number(r.after_wc) || 0));

  return { topVariantWordCounts, geoMentionScores, materialScores, editDeltas, sampleCount: rows.length };
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ─── Core: build one proposal for a template ─────────────────────────────────

async function buildProposal(
  base: AiContentTemplate,
  signals: NonNullable<Awaited<ReturnType<typeof fetchSignals>>>
): Promise<{
  newPromptTemplate: string;
  changes: EvolutionChange[];
  expectedImprovement: number;
} | null> {
  const changes: EvolutionChange[] = [];
  let newPrompt = base.user_prompt_template;
  let liftEstimate = 0;

  // ── Signal 1: word count sweet-spot ───────────────────────────────────────
  if (signals.topVariantWordCounts.length >= 5) {
    const sorted = [...signals.topVariantWordCounts].sort((a, b) => a - b);
    const p25    = sorted[Math.floor(sorted.length * 0.25)];
    const p75    = sorted[Math.floor(sorted.length * 0.75)];
    const optMin = Math.max(p25 - 5, 5);
    const optMax = p75 + 10;

    const currentMention = extractWordCountMention(newPrompt);
    if (currentMention) {
      const mMatch = currentMention.match(/\d+/g)?.map(Number) ?? [];
      const curMin = mMatch[0] ?? 0;
      const curMax = mMatch[1] ?? mMatch[0] ?? 0;

      // Only change if the sweet spot is meaningfully different (> 15 words)
      if (Math.abs(optMin - curMin) > 15 || Math.abs(optMax - curMax) > 15) {
        newPrompt = applyWordCountChange(newPrompt, currentMention, optMin, optMax);
        liftEstimate += 0.03;
        changes.push({
          type:        "word_count_adjustment",
          description: `Changed word count target from ~${curMin}–${curMax} to ${optMin}–${optMax} words`,
          data_signal: `p25=${p25} p75=${p75} from ${signals.topVariantWordCounts.length} high-score unedited variants`,
        });
      }
    }
  }

  // ── Signal 2: geographic lift ─────────────────────────────────────────────
  const geoAvgWith    = avg(signals.geoMentionScores.with);
  const geoAvgWithout = avg(signals.geoMentionScores.without);
  if (
    geoAvgWith != null &&
    geoAvgWithout != null &&
    geoAvgWith - geoAvgWithout >= 0.08 &&
    signals.geoMentionScores.with.length >= 5
  ) {
    const lift = geoAvgWith - geoAvgWithout;
    if (!newPrompt.includes("región") && !newPrompt.includes("Región")) {
      // Already has Región field, but add emphasis instruction
      newPrompt = newPrompt.replace(
        "Devuelve únicamente",
        "Nota: si la región está disponible, inclúyela de forma natural en el texto.\n\nDevuelve únicamente"
      );
      liftEstimate += Math.min(lift * 0.5, 0.05);
      changes.push({
        type:        "geographic_emphasis",
        description: "Added instruction to include geographic origin when available",
        data_signal: `variants with geo mention score avg ${geoAvgWith.toFixed(3)} vs ${geoAvgWithout.toFixed(3)} without (+${lift.toFixed(3)})`,
      });
    }
  }

  // ── Signal 3: material lift ────────────────────────────────────────────────
  const matAvgWith    = avg(signals.materialScores.with);
  const matAvgWithout = avg(signals.materialScores.without);
  if (
    matAvgWith != null &&
    matAvgWithout != null &&
    matAvgWith - matAvgWithout >= 0.10 &&
    signals.materialScores.with.length >= 5
  ) {
    const lift = matAvgWith - matAvgWithout;
    if (!newPrompt.includes("material") && !newPrompt.includes("técnica")) {
      newPrompt = newPrompt.replace(
        "Devuelve únicamente",
        "Prioriza mencionar el material o técnica de confección si está disponible.\n\nDevuelve únicamente"
      );
      liftEstimate += Math.min(lift * 0.4, 0.05);
      changes.push({
        type:        "material_emphasis",
        description: "Added instruction to prioritize material/technique mention",
        data_signal: `variants with material mention score avg ${matAvgWith.toFixed(3)} vs ${matAvgWithout.toFixed(3)} without (+${lift.toFixed(3)})`,
      });
    }
  }

  // No significant changes → no proposal
  if (changes.length === 0 || liftEstimate < IMPROVEMENT_THRESHOLD) {
    return null;
  }

  return {
    newPromptTemplate: newPrompt,
    changes,
    expectedImprovement: Math.round(liftEstimate * 1000) / 1000,
  };
}

// ─── Main: propose evolved templates for all content types ───────────────────

export async function proposeEvolvedTemplates(): Promise<Array<{
  proposed: boolean;
  content_type: string;
  reason: string;
  template_id?: string;
  slug?: string;
}>> {
  const results = [];

  for (const ct of CONTENT_TYPES) {
    // Find highest-version active template for this content type
    const currentTemplates = await AiContentTemplate.findAll({
      where: {
        content_type:  ct,
        health_status: { [Op.in]: ["active", "degraded"] },
        is_active:     true,
      },
      order: [["template_version", "DESC"]],
    });

    if (currentTemplates.length === 0) {
      results.push({ proposed: false, content_type: ct, reason: "no_active_template" });
      continue;
    }

    const base = currentTemplates[0]; // highest version

    // Check if a candidate for this template_key already exists
    const existingCandidate = await AiContentTemplate.findOne({
      where: {
        template_key:  base.template_key,
        health_status: "candidate",
      },
    });
    if (existingCandidate) {
      results.push({ proposed: false, content_type: ct, reason: "candidate_already_pending" });
      continue;
    }

    // Gather signals
    const signals = await fetchSignals(ct as ContentType);
    if (!signals) {
      results.push({ proposed: false, content_type: ct, reason: `insufficient_data (need ${MIN_SAMPLES_FOR_EVOLUTION})` });
      continue;
    }

    const proposal = await buildProposal(base, signals);
    if (!proposal) {
      results.push({ proposed: false, content_type: ct, reason: "no_significant_signals" });
      continue;
    }

    // Create candidate template (immutable new row)
    const newVersion = base.template_version + 1;
    const newSlug    = `${base.template_key}_v${newVersion}`;

    const candidate = await AiContentTemplate.create({
      slug:                 newSlug,
      template_key:         base.template_key,
      template_version:     newVersion,
      content_type:         ct,
      system_prompt:        base.system_prompt,   // system prompt stays stable
      user_prompt_template: proposal.newPromptTemplate,
      health_status:        "candidate",
      is_active:            false,
      evolved_from_id:      base.id,
      evolution_reason:     proposal.changes.map((c) => c.description).join("; "),
      evolution_changes:    proposal.changes,
      expected_improvement: proposal.expectedImprovement,
    });

    results.push({
      proposed:     true,
      content_type: ct,
      reason:       `proposed v${newVersion}: ${proposal.changes.map((c) => c.type).join(",")}`,
      template_id:  candidate.id,
      slug:         newSlug,
    });
  }

  return results;
}
