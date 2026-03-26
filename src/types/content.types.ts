// src/types/content.types.ts
//
// All enums, constants, and type aliases for the AI Content Intelligence system.
// Phase 2 MVS — no Zod dependency; use these as plain TypeScript types.

// ─── Content + Subject types ─────────────────────────────────────────────────

export const CONTENT_TYPES = [
  "caption",
  "product_description",
  "image_prompt_brief",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// MVS is scoped to 'product' only.
// Future: 'category' | 'seller' | 'editorial'
export const SUBJECT_TYPES = ["product"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

// ─── Status enums ────────────────────────────────────────────────────────────

export const ITEM_STATUSES = [
  "pending",
  "generating",
  "in_review",
  "approved",
  "published",
  "blocked",
  "archived",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const VARIANT_STATUSES = [
  "generated",
  "guardrail_checking",
  "guardrail_failed",
  "scoring",
  "queued_for_review",
  "discarded",
  "approved",
  "edited_and_approved",
  "rejected",
  "published",
  "archived",
] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const REVIEW_ACTIONS = [
  "approved",
  "edited_and_approved",
  "rejected",
  "escalated",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

// ─── Rejection taxonomy ───────────────────────────────────────────────────────
// Keep in sync with Phase 1 spec and migration comment.

export const REJECTION_REASONS = [
  "too_generic",
  "low_specificity",
  "cultural_risk",
  "unsupported_claim",
  "price_mismatch",
  "bad_tone",
  "duplicate_pattern",
  "below_threshold",
  "admin_rejected",
  "malformed_output",
  "malformed_prompt_brief",
  "prompt_budget_exceeded",
  "guardrail_check_error",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

// ─── Queue flags ─────────────────────────────────────────────────────────────

export const QUEUE_FLAGS = ["ready", "needs_attention"] as const;
export type QueueFlag = (typeof QUEUE_FLAGS)[number];

// ─── Score thresholds ─────────────────────────────────────────────────────────

export const SCORE_THRESHOLDS = {
  /** score >= this → 'ready' queue_flag */
  AUTO_QUEUE_HIGH: 0.75,
  /** score < this → discard (rejection_reason: below_threshold) */
  QUEUE_MIN: 0.40,
} as const;

// ─── State machines ──────────────────────────────────────────────────────────
// Each key maps to the array of statuses it is allowed to transition INTO.

export const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  pending:    ["generating"],
  generating: ["in_review", "blocked"],
  in_review:  ["approved", "generating", "blocked", "in_review"],
  approved:   ["published", "in_review"],
  published:  ["archived"],
  blocked:    ["pending"],  // admin can reset
  archived:   [],           // terminal
};

export const VARIANT_TRANSITIONS: Record<VariantStatus, VariantStatus[]> = {
  generated:           ["guardrail_checking"],
  guardrail_checking:  ["guardrail_failed", "scoring"],
  guardrail_failed:    [],                // terminal
  scoring:             ["queued_for_review", "discarded"],
  queued_for_review:   ["approved", "edited_and_approved", "rejected"],
  discarded:           [],                // terminal
  approved:            ["published"],
  edited_and_approved: ["published"],
  rejected:            [],                // terminal
  published:           ["archived"],
  archived:            [],                // terminal
};
