// src/config/paymentPolicies.ts
//
// Central configuration for Phase 5: Payment Security.
// Never trust frontend amounts, totals, or currency decisions.

import type { RiskLevel } from "./securityRiskRules";

// ─────────────────────────────────────────────────────────────────────────────
// Payment decision types
// ─────────────────────────────────────────────────────────────────────────────
export type PaymentDecision = "allow" | "manual_review" | "deny";

export interface PaymentPolicyEntry {
  decision: PaymentDecision;
}

export type PaymentRiskPolicy = Record<RiskLevel, PaymentPolicyEntry>;

// ─────────────────────────────────────────────────────────────────────────────
// Risk-to-decision mapping for payment operations
// ─────────────────────────────────────────────────────────────────────────────
export const PAYMENT_RISK_POLICY: PaymentRiskPolicy = {
  low:      { decision: "allow" },
  medium:   { decision: "allow" },
  high:     { decision: "manual_review" },
  critical: { decision: "deny" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Order limits — enforced server-side, never by frontend
// ─────────────────────────────────────────────────────────────────────────────
export const ORDER_LIMITS = {
  /** Maximum total order amount in the default currency unit (e.g. GTQ). */
  MAX_AMOUNT_PER_ORDER:  50_000,
  /** Minimum total order amount. */
  MIN_AMOUNT_PER_ORDER:  1,
  /** Maximum distinct items per order. */
  MAX_ITEMS_PER_ORDER:   50,
  /** Maximum quantity per line item. */
  MAX_QUANTITY_PER_ITEM: 100,
  /** Platform fee rate applied to subtotal (5%). */
  FEE_RATE:              0.05,
  /** Default transactional currency. */
  DEFAULT_CURRENCY:      "GTQ",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Orders above this amount threshold always get manual_review regardless of risk
// ─────────────────────────────────────────────────────────────────────────────
export const HIGH_VALUE_ORDER_THRESHOLD = 5_000;
