// src/services/fraudIntelligence.service.ts
//
// Phase 6 fraud detection engine.
// Reads from orders, payment_attempts, audit_events, security_alerts.
// Writes to security_profiles, manual_review_cases, and security_alerts.
// Never modifies user data or order status.

import { Op, QueryTypes, UniqueConstraintError } from "sequelize";
import { sequelize }      from "../config/db";
import Order              from "../models/Order.model";
import PaymentAttempt     from "../models/PaymentAttempt.model";
import SecurityAlert      from "../models/SecurityAlert.model";
import SecurityProfile    from "../models/SecurityProfile.model";
import ManualReviewCase   from "../models/ManualReviewCase.model";
import {
  calculateBuyerFinancialRisk,
  calculateIpFinancialRisk,
  type FinancialRiskSignals,
} from "./financialRisk.service";
import { createAlertIfNotExists } from "./securityIntelligence.service";
import { logAuditEvent }           from "./audit.service";
import {
  FINANCIAL_THRESHOLDS,
  FAILURE_THRESHOLDS,
  MULTI_ACCOUNT,
  MANUAL_REVIEW_TRIGGERS,
  SCORE_BOUNDS,
  type ProfileStatus,
  type CasePriority,
} from "../config/financialPolicies";

// ─────────────────────────────────────────────────────────────────────────────
// evaluateFinancialFraudRisk
//
// Full financial risk assessment for a single user.
// Updates their SecurityProfile and creates cases/alerts as needed.
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateFinancialFraudRisk(params: {
  userId:    number;
  sellerId?: number;
  ip?:       string;
}): Promise<{
  financialRiskScore: number;
  profileStatus:      ProfileStatus;
  signals:            string[];
}> {
  const userIdStr = String(params.userId);

  const [buyerSignals, ipSignals] = await Promise.all([
    calculateBuyerFinancialRisk(params.userId),
    params.ip ? calculateIpFinancialRisk(params.ip) : Promise.resolve(null),
  ]);

  const combinedScore = Math.min(
    100,
    buyerSignals.financialRiskScore + (ipSignals?.financialRiskScore ?? 0) / 2,
  );

  const allSignals = [
    ...buyerSignals.signals,
    ...(ipSignals?.signals.map(s => `ip_${s}`) ?? []),
  ];

  const profileStatus = deriveProfileStatus(combinedScore, buyerSignals);

  await updateSecurityProfile({
    subject_type:         "user",
    subject_key:          userIdStr,
    financial_risk_score: Math.round(combinedScore),
    status:               profileStatus,
    metadata: {
      failedAttempts:         buyerSignals.failedAttempts,
      confirmedAmount:        buyerSignals.confirmedAmount,
      manualReviewOrderCount: buyerSignals.manualReviewOrderCount,
      signals:                allSignals,
    },
  });

  // Escalate to alert if score is high enough
  if (combinedScore >= 60) {
    await createAlertIfNotExists({
      type:         "financial_risk_elevated",
      severity:     combinedScore >= 80 ? "critical" : "high",
      subject_type: "user",
      subject_key:  userIdStr,
      title:        `Elevated financial risk for user ${params.userId}`,
      description:  `Financial risk score: ${Math.round(combinedScore)}. Signals: ${allSignals.join(", ")}`,
      metadata:     { financialRiskScore: Math.round(combinedScore), signals: allSignals },
    });
  }

  return {
    financialRiskScore: Math.round(combinedScore),
    profileStatus,
    signals:            allSignals,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// detectHighValueRiskyOrders
//
// Finds orders above HIGH_VALUE_ORDER threshold that are still pending_payment
// or manual_review, without a manual review case. Creates cases for them.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectHighValueRiskyOrders(): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orders = await Order.findAll({
    where: {
      total_amount: { [Op.gte]: FINANCIAL_THRESHOLDS.HIGH_VALUE_ORDER },
      status:       { [Op.in]: ["pending_payment", "manual_review", "paid"] },
      created_at:   { [Op.gte]: since24h },
    },
    attributes: ["id", "buyer_id", "seller_id", "total_amount", "status", "risk_level"],
  });

  for (const order of orders) {
    const priority: CasePriority =
      Number(order.total_amount) >= FINANCIAL_THRESHOLDS.DENY_ORDER_AMOUNT
        ? "critical"
        : "high";

    await createManualReviewCaseIfNotExists({
      case_type:           "high_value_order",
      subject_type:        "user",
      subject_key:         String(order.buyer_id),
      related_order_id:    order.id,
      priority,
      reason:              `Order ${order.id} exceeds high-value threshold (${order.total_amount})`,
      metadata: {
        trigger:      "high_value_order_scan",
        policy:       `HIGH_VALUE_ORDER>=${FINANCIAL_THRESHOLDS.HIGH_VALUE_ORDER}`,
        riskLevel:    order.risk_level,
        orderId:      order.id,
        total_amount: Number(order.total_amount),
        status:       order.status,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectPaymentFailureBurst
//
// Finds buyers with ≥ BURST_MIN_COUNT failed attempts in BURST_WINDOW_MS.
// Creates a manual review case and a security alert.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectPaymentFailureBurst(): Promise<void> {
  const since = new Date(Date.now() - FAILURE_THRESHOLDS.BURST_WINDOW_MS);

  // Get all orders in the window
  const rows = await sequelize.query<{
    buyer_id:      string;
    failed_count:  string;
    total_amount:  string;
  }>(
    `
    SELECT
      o.buyer_id::text,
      COUNT(pa.id)::text            AS failed_count,
      SUM(pa.amount_expected)::text AS total_amount
    FROM   payment_attempts pa
    JOIN   orders o ON o.id = pa.order_id
    WHERE  pa.status     = 'failed'
      AND  pa.created_at >= :since
    GROUP  BY o.buyer_id
    HAVING COUNT(pa.id) >= :minCount
    `,
    {
      replacements: { since, minCount: FAILURE_THRESHOLDS.BURST_MIN_COUNT },
      type: QueryTypes.SELECT,
    },
  );

  for (const row of rows) {
    await createManualReviewCaseIfNotExists({
      case_type:    "payment_failure_burst",
      subject_type: "user",
      subject_key:  row.buyer_id,
      priority:     "high",
      reason:       `${row.failed_count} failed payment attempts in ${FAILURE_THRESHOLDS.BURST_WINDOW_MS / 60000} minutes`,
      metadata: {
        trigger:        "payment_failure_burst_scan",
        policy:         `BURST_MIN_COUNT>=${FAILURE_THRESHOLDS.BURST_MIN_COUNT}`,
        riskLevel:      "high",
        failedCount:    Number(row.failed_count),
        totalAttempted: Number(row.total_amount),
        windowMinutes:  FAILURE_THRESHOLDS.BURST_WINDOW_MS / 60000,
      },
    });

    await createAlertIfNotExists({
      type:         "payment_failure_burst",
      severity:     "high",
      subject_type: "user",
      subject_key:  row.buyer_id,
      title:        `Payment failure burst for user ${row.buyer_id}`,
      description:  `${row.failed_count} failed attempts in the last hour`,
      metadata:     { failedCount: Number(row.failed_count) },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectMultiAccountPaymentPattern
//
// Finds IPs with ≥ DISTINCT_BUYERS_THRESHOLD distinct buyer_ids making
// payment attempts. Suggests account farming / card testing.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectMultiAccountPaymentPattern(): Promise<void> {
  const since = new Date(Date.now() - MULTI_ACCOUNT.WINDOW_MS);

  const rows = await sequelize.query<{
    ip_address:      string;
    distinct_buyers: string;
    total_attempts:  string;
  }>(
    `
    SELECT
      ae.ip_address,
      COUNT(DISTINCT ae.actor_user_id)::text AS distinct_buyers,
      COUNT(ae.id)::text                     AS total_attempts
    FROM   audit_events ae
    WHERE  ae.action      LIKE 'payment.%'
      AND  ae.created_at >= :since
      AND  ae.actor_user_id IS NOT NULL
    GROUP  BY ae.ip_address
    HAVING COUNT(DISTINCT ae.actor_user_id) >= :threshold
    `,
    {
      replacements: { since, threshold: MULTI_ACCOUNT.DISTINCT_BUYERS_THRESHOLD },
      type: QueryTypes.SELECT,
    },
  );

  for (const row of rows) {
    await createManualReviewCaseIfNotExists({
      case_type:    "multi_account_payment_pattern",
      subject_type: "ip",
      subject_key:  row.ip_address,
      priority:     "critical",
      reason:       `IP ${row.ip_address} used by ${row.distinct_buyers} distinct buyers for payment attempts`,
      metadata: {
        trigger:        "multi_account_payment_scan",
        policy:         `DISTINCT_BUYERS>=${MULTI_ACCOUNT.DISTINCT_BUYERS_THRESHOLD}`,
        riskLevel:      "critical",
        distinctBuyers: Number(row.distinct_buyers),
        totalAttempts:  Number(row.total_attempts),
        windowHours:    MULTI_ACCOUNT.WINDOW_MS / 3600000,
      },
    });

    await createAlertIfNotExists({
      type:         "multi_account_payment_pattern",
      severity:     "critical",
      subject_type: "ip",
      subject_key:  row.ip_address,
      title:        `Multi-account payment pattern from IP ${row.ip_address}`,
      description:  `${row.distinct_buyers} distinct buyer accounts used for payments from this IP`,
      metadata:     {
        distinctBuyers: Number(row.distinct_buyers),
        totalAttempts:  Number(row.total_attempts),
      },
    });

    // Update IP profile
    await updateSecurityProfile({
      subject_type:         "ip",
      subject_key:          row.ip_address,
      financial_risk_score: 90,
      status:               "flagged",
      metadata:             { distinctBuyers: Number(row.distinct_buyers) },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectRepeatManualReviewActors
//
// Finds buyers who have had ≥ REPEAT_REVIEW_COUNT orders land in manual_review
// within REPEAT_REVIEW_WINDOW_MS. Escalates their profile.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectRepeatManualReviewActors(): Promise<void> {
  const since = new Date(Date.now() - MANUAL_REVIEW_TRIGGERS.REPEAT_REVIEW_WINDOW_MS);

  const rows = await sequelize.query<{ buyer_id: string; review_count: string }>(
    `
    SELECT buyer_id::text, COUNT(id)::text AS review_count
    FROM   orders
    WHERE  status     = 'manual_review'
      AND  created_at >= :since
    GROUP  BY buyer_id
    HAVING COUNT(id) >= :threshold
    `,
    {
      replacements: { since, threshold: MANUAL_REVIEW_TRIGGERS.REPEAT_REVIEW_COUNT },
      type: QueryTypes.SELECT,
    },
  );

  for (const row of rows) {
    await createManualReviewCaseIfNotExists({
      case_type:    "repeat_manual_review_actor",
      subject_type: "user",
      subject_key:  row.buyer_id,
      priority:     "high",
      reason:       `User ${row.buyer_id} has had ${row.review_count} orders flagged for manual review in the last 7 days`,
      metadata: {
        trigger:     "repeat_manual_review_scan",
        policy:      `REPEAT_REVIEW_COUNT>=${MANUAL_REVIEW_TRIGGERS.REPEAT_REVIEW_COUNT}`,
        riskLevel:   "high",
        reviewCount: Number(row.review_count),
        windowDays:  MANUAL_REVIEW_TRIGGERS.REPEAT_REVIEW_WINDOW_MS / 86400000,
      },
    });

    await updateSecurityProfile({
      subject_type:         "user",
      subject_key:          row.buyer_id,
      financial_risk_score: 70,
      status:               "flagged",
      metadata:             { repeatManualReviewCount: Number(row.review_count) },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createManualReviewCaseIfNotExists
//
// Idempotent. Does not create a duplicate open/in_review case for the same
// (case_type, subject_type, subject_key, related_order_id).
// ─────────────────────────────────────────────────────────────────────────────
interface CreateCaseInput {
  case_type:                   string;
  subject_type:                string;
  subject_key:                 string;
  related_order_id?:           number | null;
  related_payment_attempt_id?: number | null;
  priority:                    CasePriority;
  reason:                      string;
  metadata?:                   Record<string, unknown> | null;
}

export async function createManualReviewCaseIfNotExists(
  input: CreateCaseInput,
): Promise<ManualReviewCase | null> {
  try {
    // Always include related_order_id in the dedup key — even when null —
    // so a case tied to a specific order is distinct from a general subject case.
    const whereClause: Record<string, unknown> = {
      case_type:        input.case_type,
      subject_type:     input.subject_type,
      subject_key:      input.subject_key,
      status:           { [Op.in]: ["open", "in_review", "escalated"] },
      related_order_id: input.related_order_id ?? null,
    };

    const existing = await ManualReviewCase.findOne({ where: whereClause });
    if (existing) return null;

    const created = await ManualReviewCase.create({
      case_type:                  input.case_type,
      subject_type:               input.subject_type,
      subject_key:                input.subject_key,
      related_order_id:           input.related_order_id ?? null,
      related_payment_attempt_id: input.related_payment_attempt_id ?? null,
      priority:                   input.priority,
      status:                     "open",
      reason:                     input.reason,
      metadata:                   input.metadata ?? null,
      assigned_to:                null,
      resolved_at:                null,
    });

    void logAuditEvent({
      actor_user_id:  null,
      actor_role:     "system",
      action:         "manual_review.case.created",
      entity_type:    "manual_review_case",
      entity_id:      String(created.id),
      ip_address:     "internal",
      user_agent:     "",
      http_method:    "",
      route:          "",
      status:         "success",
      severity:       input.priority === "critical" ? "critical" : input.priority === "high" ? "high" : "medium",
      metadata:       {
        case_type:    input.case_type,
        subject_type: input.subject_type,
        subject_key:  input.subject_key,
        priority:     input.priority,
      },
    });

    return created;
  } catch (err) {
    if (err instanceof UniqueConstraintError) return null;
    console.error("[fraud] Failed to create manual review case:", (err as Error)?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateSecurityProfile
//
// Upserts a SecurityProfile for a given subject. Merges metadata.
// Only updates financial_risk_score if it is higher than the stored value,
// preventing a single clean scan from wiping accumulated risk.
// Status is always updated to the highest-severity value.
// ─────────────────────────────────────────────────────────────────────────────
interface UpdateProfileInput {
  subject_type:          string;
  subject_key:           string;
  financial_risk_score:  number;
  status:                ProfileStatus;
  metadata?:             Record<string, unknown> | null;
}

const STATUS_PRIORITY: Record<ProfileStatus, number> = {
  active:    0,
  cleared:   0,
  flagged:   1,
  suspended: 2,
};

export async function updateSecurityProfile(input: UpdateProfileInput): Promise<void> {
  try {
    const existing = await SecurityProfile.findOne({
      where: {
        subject_type: input.subject_type,
        subject_key:  input.subject_key,
      },
    });

    if (existing) {
      // Decay: existing score decays toward 0 over time rather than holding peak forever.
      // The incoming score still wins if it is higher than the decayed value.
      const decayFactor         = 0.7;
      const decayedFinancial    = Math.round(existing.financial_risk_score * decayFactor);
      const decayedRisk         = Math.round(existing.risk_score           * decayFactor);
      const newFinancialScore   = Math.max(input.financial_risk_score, decayedFinancial);
      const newRiskScore        = Math.max(input.financial_risk_score, decayedRisk);

      const newStatus = STATUS_PRIORITY[input.status] >= STATUS_PRIORITY[existing.status]
        ? input.status
        : existing.status;

      // Merge metadata
      const mergedMeta = {
        ...(existing.metadata as Record<string, unknown> | null ?? {}),
        ...(input.metadata ?? {}),
      };

      await existing.update({
        financial_risk_score: Math.min(100, newFinancialScore),
        risk_score:           Math.min(100, newRiskScore),
        trust_score:          Math.max(0, SCORE_BOUNDS.INITIAL_TRUST - newFinancialScore / 2),
        status:               newStatus,
        last_evaluated_at:    new Date(),
        metadata:             mergedMeta,
      });
    } else {
      const score = Math.min(100, input.financial_risk_score);
      await SecurityProfile.create({
        subject_type:         input.subject_type,
        subject_key:          input.subject_key,
        trust_score:          Math.max(0, SCORE_BOUNDS.INITIAL_TRUST - score / 2),
        risk_score:           score,
        financial_risk_score: score,
        status:               input.status,
        last_evaluated_at:    new Date(),
        metadata:             input.metadata ?? null,
      });
    }
  } catch (err) {
    console.error("[fraud] Failed to update security profile:", (err as Error)?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateFinancialFraudSignals
//
// Master runner — executes all detectors in parallel.
// Safe to call from a cron or admin endpoint.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateFinancialFraudSignals(): Promise<{
  ok:      boolean;
  message: string;
}> {
  try {
    await Promise.all([
      detectHighValueRiskyOrders(),
      detectPaymentFailureBurst(),
      detectMultiAccountPaymentPattern(),
      detectRepeatManualReviewActors(),
    ]);

    const openCases = await ManualReviewCase.count({
      where: { status: { [Op.in]: ["open", "in_review", "escalated"] } },
    });

    return {
      ok:      true,
      message: `Fraud scan complete. ${openCases} active manual review case(s).`,
    };
  } catch (err) {
    console.error("[fraud] generateFinancialFraudSignals failed:", (err as Error)?.message);
    return { ok: false, message: "Fraud scan failed — see server logs." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function deriveProfileStatus(
  score:   number,
  signals: FinancialRiskSignals,
): ProfileStatus {
  if (score >= 80) return "suspended";
  if (score >= 50) return "flagged";
  if (signals.failedAttempts === 0 && signals.manualReviewOrderCount === 0) return "cleared";
  return "active";
}
