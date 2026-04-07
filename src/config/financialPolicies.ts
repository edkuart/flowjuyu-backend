// src/config/financialPolicies.ts
//
// Central configuration for Phase 6: Financial Fraud & Control Layer.
// All numeric thresholds are tunable here — no hardcoded values in services.

// ─────────────────────────────────────────────────────────────────────────────
// Order amount thresholds
// ─────────────────────────────────────────────────────────────────────────────
export const FINANCIAL_THRESHOLDS = {
  /** Orders above this value are always flagged for manual review. */
  HIGH_VALUE_ORDER:             5_000,

  /** Orders above this value are automatically denied without review. */
  DENY_ORDER_AMOUNT:            30_000,

  /** Single payment attempt above this triggers a high-value signal. */
  HIGH_VALUE_ATTEMPT:           5_000,

  /** Accumulated attempted spend (confirmed + pending) in 24 h before alert. */
  DAILY_SPEND_ALERT_THRESHOLD:  15_000,

  /** Accumulated confirmed spend per user in 24 h before manual review. */
  DAILY_CONFIRMED_SPEND_REVIEW: 20_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Payment failure thresholds
// ─────────────────────────────────────────────────────────────────────────────
export const FAILURE_THRESHOLDS = {
  /** Minimum failed attempts in the detection window to trigger a burst alert. */
  BURST_MIN_COUNT:       4,

  /** Detection window for payment failure burst, in milliseconds. */
  BURST_WINDOW_MS:       60 * 60 * 1000,   // 1 hour

  /** Failed ratio (failed / total) above which a profile is degraded. */
  HIGH_FAILURE_RATIO:    0.6,

  /** Minimum total attempts required before ratio is meaningful. */
  RATIO_MIN_ATTEMPTS:    3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Multi-account detection
// ─────────────────────────────────────────────────────────────────────────────
export const MULTI_ACCOUNT = {
  /** Number of distinct buyer_ids from the same IP in the window before alert. */
  DISTINCT_BUYERS_THRESHOLD: 3,

  /** Detection window in milliseconds. */
  WINDOW_MS:                 24 * 60 * 60 * 1000,  // 24 hours
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Manual review case triggers
// ─────────────────────────────────────────────────────────────────────────────
export const MANUAL_REVIEW_TRIGGERS = {
  /** Orders in manual_review status count above this → escalate the profile. */
  REPEAT_REVIEW_COUNT:  3,

  /** Lookback window for repeat manual review detection. */
  REPEAT_REVIEW_WINDOW_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Trust / risk score bounds
// ─────────────────────────────────────────────────────────────────────────────
export const SCORE_BOUNDS = {
  MIN:          0,
  MAX:          100,
  /** New profiles start here. */
  INITIAL_TRUST: 50,
  INITIAL_RISK:  0,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Profile status values (kept here for type-safe usage in services)
// ─────────────────────────────────────────────────────────────────────────────
export const PROFILE_STATUSES = ["active", "flagged", "suspended", "cleared"] as const;
export type ProfileStatus = typeof PROFILE_STATUSES[number];

export const CASE_STATUSES    = ["open", "in_review", "approved", "rejected", "escalated"] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

export const CASE_PRIORITIES  = ["low", "medium", "high", "critical"] as const;
export type CasePriority = typeof CASE_PRIORITIES[number];
