// src/services/content/ContentScoringService.ts
//
// Computes the generation_score for a content variant.
// This is quality-at-creation-time scoring — NOT performance scoring.
// Pragmatic heuristics for MVS; structure is designed to be replaceable in Phase 3.
//
// Formula:
//   generation_score = specificity*0.35 + brand_alignment*0.30 + readability*0.20 + seo*0.15
//
// Routing:
//   score >= 0.75 → queued_for_review (queue_flag: 'ready')
//   score  0.40–0.74 → queued_for_review (queue_flag: 'needs_attention')
//   score < 0.40    → discarded (rejection_reason: 'below_threshold')

import AiContentVariant from "../../models/AiContentVariant.model";
import type { ContentType, QueueFlag } from "../../types/content.types";
import { SCORE_THRESHOLDS } from "../../types/content.types";

// ─── Reference corpus (locked — never auto-updated) ──────────────────────────
// Key terms from the 3 existing editorial pages; used for brand_alignment scoring.
// TODO Phase 3: compute cosine similarity against embedded corpus via pgvector.

const BRAND_VOICE_TERMS = [
  "artesano", "artesana", "tejido", "hilado", "telar", "algodón", "lana",
  "comunidad", "tradición", "técnica", "proceso", "hilos", "colores",
  "diseño", "patrón", "textil", "tela", "guatemalteco", "guatemalteca",
  "mano", "manos", "hecho a mano", "hebra", "fibra",
];

// SEO keyword targets per content type
const SEO_KEYWORDS: Record<ContentType, string[]> = {
  caption: [
    "textil", "artesanal", "guatemala", "tejido", "artesano",
  ],
  product_description: [
    "textil", "artesanal", "guatemalteco", "tejido", "telar", "algodón",
  ],
  image_prompt_brief: [],  // scored on structural completeness instead
};

// Required fields for a valid image_prompt_brief
const IMAGE_BRIEF_REQUIRED_FIELDS = [
  "STYLE:", "SUBJECT:", "LIGHT:", "BACKGROUND:",
  "COLOR_ANCHOR:", "HANDS:", "AVOID:",
];

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ─── Score components ────────────────────────────────────────────────────────

function scoreSpecificity(
  text: string,
  productName: string,
  precio: number | null
): number {
  let score = 0;
  const lc = text.toLowerCase();

  if (lc.includes(productName.toLowerCase())) score += 0.35;

  if (precio !== null) {
    const priceStr = String(Math.round(precio));
    if (text.includes(priceStr) || text.includes(`Q${priceStr}`)) score += 0.20;
  }

  const materialTerms = [
    "algodón", "lana", "seda", "jaspe", "brocado", "bordado",
    "telar", "hilado", "fibra natural",
  ];
  if (materialTerms.some((t) => lc.includes(t))) score += 0.25;

  const specificLocations = [
    "salcajá", "sololá", "totonicapán", "momostenango",
    "chichicastenango", "antigua", "quiché", "huehuetenango",
  ];
  if (specificLocations.some((g) => lc.includes(g))) score += 0.20;

  return clamp(score);
}

function scoreBrandAlignment(text: string): number {
  const lc = text.toLowerCase();

  const present = BRAND_VOICE_TERMS.filter((t) => lc.includes(t)).length;
  const ratio   = present / BRAND_VOICE_TERMS.length;

  // Penalty for brand violations
  const violations = [
    "descuento", "oferta", "gratis", "envío gratis", "¡¡", "barato",
  ];
  const violationPenalty = violations.filter((v) => lc.includes(v)).length * 0.15;

  // Penalty for em-dash overuse (a common LLM tell)
  const emDashCount   = (text.match(/—/g) ?? []).length;
  const emDashPenalty = emDashCount > 1 ? (emDashCount - 1) * 0.10 : 0;

  return clamp(ratio * 1.6 - violationPenalty - emDashPenalty);
}

function scoreReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const words     = text.split(/\s+/).filter(Boolean);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgWordLength       = words.join("").length / words.length;

  // Target: 10–22 words/sentence, 4–8 chars/word
  const sentencePenalty =
    avgWordsPerSentence < 8 || avgWordsPerSentence > 28 ? 0.20 : 0;
  const wordLengthPenalty =
    avgWordLength < 3 || avgWordLength > 9 ? 0.15 : 0;

  // Bonus for sentence length variance (human writing varies more than LLM)
  const lengths    = sentences.map((s) => s.split(/\s+/).length);
  const mean       = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance   = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const varianceBonus = variance > 12 ? 0.10 : 0;

  return clamp(0.70 - sentencePenalty - wordLengthPenalty + varianceBonus);
}

function scoreSeoKeywords(text: string, content_type: ContentType): number {
  if (content_type === "image_prompt_brief") {
    // For briefs: score based on structural field completeness instead
    const presentFields = IMAGE_BRIEF_REQUIRED_FIELDS.filter((f) =>
      text.includes(f)
    ).length;
    return clamp(presentFields / IMAGE_BRIEF_REQUIRED_FIELDS.length);
  }

  const keywords = SEO_KEYWORDS[content_type] ?? [];
  if (keywords.length === 0) return 0.5;

  const lc = text.toLowerCase();
  const present = keywords.filter((k) => lc.includes(k)).length;
  const coverage = present / keywords.length;

  // Penalty for keyword stuffing (same keyword > 3 times)
  const stuffed = keywords.some((k) => {
    const count = (lc.match(new RegExp(k, "g")) ?? []).length;
    return count > 3;
  });

  return clamp(coverage - (stuffed ? 0.20 : 0));
}

// ─── Public interface ────────────────────────────────────────────────────────

export interface ScoringInput {
  productName: string;
  precio: number | null;
}

export interface ScoringResult {
  specificity:      number;
  brand_alignment:  number;
  readability:      number;
  seo_coverage:     number;
  generation_score: number;
  queue_flag:       QueueFlag | null;
  should_discard:   boolean;
}

export function scoreContent(
  text: string,
  content_type: ContentType,
  input: ScoringInput
): ScoringResult {
  const specificity     = scoreSpecificity(text, input.productName, input.precio);
  const brand_alignment = scoreBrandAlignment(text);
  const readability     = scoreReadability(text);
  const seo_coverage    = scoreSeoKeywords(text, content_type);

  const generation_score = clamp(
    specificity     * 0.35 +
    brand_alignment * 0.30 +
    readability     * 0.20 +
    seo_coverage    * 0.15
  );

  let queue_flag: QueueFlag | null = null;
  let should_discard = false;

  if (generation_score < SCORE_THRESHOLDS.QUEUE_MIN) {
    should_discard = true;
  } else if (generation_score >= SCORE_THRESHOLDS.AUTO_QUEUE_HIGH) {
    queue_flag = "ready";
  } else {
    queue_flag = "needs_attention";
  }

  return {
    specificity,
    brand_alignment,
    readability,
    seo_coverage,
    generation_score,
    queue_flag,
    should_discard,
  };
}

/** Write scoring result to the variant record and route to correct status. */
export async function applyScoring(
  variant: AiContentVariant,
  result: ScoringResult
): Promise<void> {
  const scoreFields = {
    score_specificity:     result.specificity,
    score_brand_alignment: result.brand_alignment,
    score_readability:     result.readability,
    score_seo_coverage:    result.seo_coverage,
    generation_score:      result.generation_score,
  };

  if (result.should_discard) {
    await variant.update({
      ...scoreFields,
      status:           "discarded",
      rejection_reason: "below_threshold",
    });
  } else {
    await variant.update({
      ...scoreFields,
      status:     "queued_for_review",
      queue_flag: result.queue_flag,
    });
  }
}
