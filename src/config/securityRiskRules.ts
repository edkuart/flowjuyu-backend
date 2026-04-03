// src/config/securityRiskRules.ts
//
// Central configuration for the security intelligence layer.
// All risk scoring, thresholds, and pattern detection rules live here.
// Keep this file the single source of truth — do not hardcode values elsewhere.

// ─────────────────────────────────────────────────────────────────────────────
// Risk weights per audit action
// Higher weight = more suspicious signal per occurrence
// ─────────────────────────────────────────────────────────────────────────────
export const RISK_WEIGHTS: Record<string, number> = {
  "auth.login.failed":                    10,
  "auth.login.blocked":                   25,
  "review.create.blocked":                20,
  "review.create.duplicate_blocked":      10,
  "review.create.mismatch_blocked":       15,
  "seller.kyc.upload.failed":             20,
  "seller.kyc.upload.blocked":            30,
  "seller.kyc.revalidate.failed":         20,
  "auth.role.denied":                     15,
  "admin.kyc.view.success":                5,
  "admin.seller.reject.success":          10,
  "admin.seller.suspend.success":         15,
};

// ─────────────────────────────────────────────────────────────────────────────
// Risk level thresholds (score → level)
// ─────────────────────────────────────────────────────────────────────────────
export const RISK_THRESHOLDS = {
  low:      { min: 0,   max: 29  },
  medium:   { min: 30,  max: 59  },
  high:     { min: 60,  max: 99  },
  critical: { min: 100, max: Infinity },
} as const;

export type RiskLevel = keyof typeof RISK_THRESHOLDS;

export function scoreToLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.critical.min) return "critical";
  if (score >= RISK_THRESHOLDS.high.min)     return "high";
  if (score >= RISK_THRESHOLDS.medium.min)   return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern detection rules
// Each rule defines what actions to count, the time window, and
// the minimum count that triggers an alert.
// ─────────────────────────────────────────────────────────────────────────────
export interface PatternRule {
  name:         string;
  alertType:    string;
  severity:     "low" | "medium" | "high" | "critical";
  actions:      string[];
  windowMs:     number;  // lookback window in milliseconds
  minCount:     number;  // minimum matching events to trigger
  description:  string;
}

export const SECURITY_PATTERN_RULES: PatternRule[] = [
  {
    name:        "suspicious_login_burst",
    alertType:   "suspicious_login_burst",
    severity:    "high",
    actions:     ["auth.login.failed", "auth.login.blocked"],
    windowMs:    15 * 60 * 1000,   // 15 minutes
    minCount:    5,
    description: "Multiple failed/blocked login attempts from the same IP in a short window.",
  },
  {
    name:        "review_abuse_pattern",
    alertType:   "review_abuse_pattern",
    severity:    "medium",
    actions:     [
      "review.create.blocked",
      "review.create.duplicate_blocked",
      "review.create.mismatch_blocked",
    ],
    windowMs:    60 * 60 * 1000,   // 1 hour
    minCount:    3,
    description: "User or IP generating multiple blocked/duplicate review attempts.",
  },
  {
    name:        "kyc_evasion_pattern",
    alertType:   "kyc_evasion_pattern",
    severity:    "high",
    actions:     [
      "seller.kyc.upload.failed",
      "seller.kyc.upload.blocked",
      "seller.kyc.revalidate.failed",
    ],
    windowMs:    2 * 60 * 60 * 1000,  // 2 hours
    minCount:    4,
    description: "Repeated KYC upload failures or blocked attempts from the same user.",
  },
  {
    name:        "cross_surface_abuse",
    alertType:   "cross_surface_abuse",
    severity:    "critical",
    actions:     [
      "auth.login.failed",
      "auth.login.blocked",
      "review.create.blocked",
      "review.create.duplicate_blocked",
      "review.create.mismatch_blocked",
      "seller.kyc.upload.failed",
      "seller.kyc.upload.blocked",
    ],
    windowMs:    60 * 60 * 1000,  // 1 hour
    minCount:    8,               // total across surfaces
    description: "Single IP appearing across login, review, and KYC abuse signals simultaneously.",
  },
  {
    name:        "admin_high_volume_sensitive_access",
    alertType:   "admin_high_volume_sensitive_access",
    severity:    "medium",
    actions:     [
      "admin.kyc.view.success",
      "admin.seller.approve.success",
      "admin.seller.reject.success",
      "admin.seller.suspend.success",
    ],
    windowMs:    30 * 60 * 1000,  // 30 minutes
    minCount:    20,
    description: "Admin performing unusually high volume of sensitive governance actions.",
  },
];
