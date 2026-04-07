// src/services/paymentSecurity.service.ts
//
// Uses Phase 3 (risk scoring) and Phase 4 (active restrictions + alerts) as
// inputs for payment-level risk decisions. Read-only — never modifies user data.

import { Op } from "sequelize";
import {
  calculateUserRisk,
  calculateIpRisk,
} from "./securityIntelligence.service";
import { getActiveRestrictionsForSubject } from "./activeDefense.service";
import SecurityAlert from "../models/SecurityAlert.model";
import {
  PAYMENT_RISK_POLICY,
  HIGH_VALUE_ORDER_THRESHOLD,
  type PaymentDecision,
} from "../config/paymentPolicies";
import { scoreToLevel, type RiskLevel } from "../config/securityRiskRules";

// ─────────────────────────────────────────────────────────────────────────────
// Output type
// ─────────────────────────────────────────────────────────────────────────────
export interface PaymentRiskDecision {
  decision:  PaymentDecision;
  reason:    string;
  riskLevel: RiskLevel;
  metadata:  Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: priority-ordered level comparison
// ─────────────────────────────────────────────────────────────────────────────
const LEVEL_PRIORITY: Record<RiskLevel, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_PRIORITY[a] >= LEVEL_PRIORITY[b] ? a : b;
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluateOrderRisk
//
// Full risk assessment for a new order: reads user risk, IP risk, active
// restrictions, and open security alerts. Applies PAYMENT_RISK_POLICY.
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateOrderRisk(params: {
  userId:      number;
  ip:          string;
  orderId?:    number;
  totalAmount: number;
}): Promise<PaymentRiskDecision> {
  const userIdStr = String(params.userId);

  const [
    userRisk,
    ipRisk,
    userRestrictions,
    ipRestrictions,
    openAlerts,
  ] = await Promise.all([
    calculateUserRisk(params.userId),
    calculateIpRisk(params.ip),
    getActiveRestrictionsForSubject("user", userIdStr),
    getActiveRestrictionsForSubject("ip", params.ip),
    SecurityAlert.findAll({
      where: {
        status: { [Op.in]: ["open", "acknowledged"] },
        [Op.or]: [
          { subject_type: "user", subject_key: userIdStr },
          { subject_type: "ip",   subject_key: params.ip },
        ],
      },
    }),
  ]);

  const hasActiveRestriction = userRestrictions.length > 0 || ipRestrictions.length > 0;
  const openAlertCount       = openAlerts.length;

  // Effective risk level: max of user score, IP score, and alert escalation
  let effectiveLevel: RiskLevel = maxLevel(userRisk.level, ipRisk.level);
  if (openAlertCount > 0) effectiveLevel = maxLevel(effectiveLevel, "medium");
  if (openAlertCount >= 3) effectiveLevel = maxLevel(effectiveLevel, "high");

  // Active restrictions always escalate to at least high
  if (hasActiveRestriction) effectiveLevel = maxLevel(effectiveLevel, "high");

  let decision: PaymentDecision = PAYMENT_RISK_POLICY[effectiveLevel].decision;
  const reasons: string[] = [`risk_level=${effectiveLevel}`];

  if (userRisk.score > 0) reasons.push(`user_risk_score=${userRisk.score}`);
  if (ipRisk.score > 0)   reasons.push(`ip_risk_score=${ipRisk.score}`);
  if (openAlertCount > 0) reasons.push(`open_alerts=${openAlertCount}`);
  if (hasActiveRestriction) {
    reasons.push("active_restriction=true");
    decision = "deny";  // active restriction always blocks payment
  }

  // High-value orders escalate to manual_review at minimum
  if (
    params.totalAmount >= HIGH_VALUE_ORDER_THRESHOLD &&
    decision === "allow"
  ) {
    decision = "manual_review";
    reasons.push(`high_value_order=${params.totalAmount}`);
  }

  return {
    decision,
    reason:    reasons.join(" | "),
    riskLevel: effectiveLevel,
    metadata: {
      userRiskScore:     userRisk.score,
      userRiskLevel:     userRisk.level,
      ipRiskScore:       ipRisk.score,
      ipRiskLevel:       ipRisk.level,
      openAlertCount,
      hasActiveRestriction,
      totalAmount:       params.totalAmount,
      orderId:           params.orderId ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluatePaymentAttempt
//
// Risk check specifically for a payment attempt (not order creation).
// Lighter weight — uses the same data sources but focuses on attempt patterns.
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluatePaymentAttempt(params: {
  userId:         number;
  ip:             string;
  orderId:        number;
  amount:         number;
  idempotencyKey: string;
}): Promise<PaymentRiskDecision> {
  // Reuse order risk evaluation for attempt risk
  return evaluateOrderRisk({
    userId:      params.userId,
    ip:          params.ip,
    orderId:     params.orderId,
    totalAmount: params.amount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// decidePaymentAction
//
// Pure decision function — no DB calls. Used internally and for testing.
// ─────────────────────────────────────────────────────────────────────────────
export function decidePaymentAction(params: {
  userRiskLevel:        RiskLevel;
  ipRiskLevel:          RiskLevel;
  hasActiveRestrictions: boolean;
  hasOpenAlerts:        boolean;
  amount:               number;
}): { decision: PaymentDecision; riskLevel: RiskLevel } {
  let level: RiskLevel = maxLevel(params.userRiskLevel, params.ipRiskLevel);

  if (params.hasOpenAlerts)        level = maxLevel(level, "medium");
  if (params.hasActiveRestrictions) level = maxLevel(level, "high");

  let decision: PaymentDecision = PAYMENT_RISK_POLICY[level].decision;

  if (params.hasActiveRestrictions) decision = "deny";

  if (params.amount >= HIGH_VALUE_ORDER_THRESHOLD && decision === "allow") {
    decision = "manual_review";
  }

  return { decision, riskLevel: level };
}
