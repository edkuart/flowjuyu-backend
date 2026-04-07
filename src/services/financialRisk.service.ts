// src/services/financialRisk.service.ts
//
// Computes financial risk signals from payment_attempts and orders.
// Read-only — never writes to any table.

import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import PaymentAttempt from "../models/PaymentAttempt.model";
import Order          from "../models/Order.model";
import {
  FINANCIAL_THRESHOLDS,
  FAILURE_THRESHOLDS,
} from "../config/financialPolicies";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
export interface FinancialRiskSignals {
  totalAttempts:           number;
  confirmedAttempts:       number;
  failedAttempts:          number;
  failedRatio:             number;            // 0–1
  attemptedAmount:         number;            // sum of amount_expected for all attempts
  confirmedAmount:         number;            // sum confirmed only
  highValueAttemptCount:   number;
  manualReviewOrderCount:  number;
  financialRiskScore:      number;            // 0–100
  signals:                 string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateBuyerFinancialRisk
// Looks at payment_attempts by joining to orders for buyer_id.
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateBuyerFinancialRisk(userId: number): Promise<FinancialRiskSignals> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get all orders for this buyer in the last 7 days
  const orders = await Order.findAll({
    where: {
      buyer_id:   userId,
      created_at: { [Op.gte]: since7d },
    },
    attributes: ["id", "status", "total_amount"],
  });

  const orderIds           = orders.map(o => o.id);
  const manualReviewOrders = orders.filter(o => o.status === "manual_review");

  if (orderIds.length === 0) {
    return emptySignals();
  }

  // Get payment attempts for those orders
  const attempts = await PaymentAttempt.findAll({
    where: {
      order_id:   { [Op.in]: orderIds },
      created_at: { [Op.gte]: since24h },
    },
    attributes: ["status", "amount_expected"],
  });

  return buildSignals(attempts, manualReviewOrders.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateSellerFinancialRisk
// Looks at orders for this seller to detect anomalous buyer patterns.
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateSellerFinancialRisk(sellerId: number): Promise<FinancialRiskSignals> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const orders = await Order.findAll({
    where: {
      seller_id:  sellerId,
      created_at: { [Op.gte]: since7d },
    },
    attributes: ["id", "status", "total_amount"],
  });

  const orderIds           = orders.map(o => o.id);
  const manualReviewOrders = orders.filter(o => o.status === "manual_review");

  if (orderIds.length === 0) return emptySignals();

  const attempts = await PaymentAttempt.findAll({
    where: { order_id: { [Op.in]: orderIds } },
    attributes: ["status", "amount_expected"],
  });

  return buildSignals(attempts, manualReviewOrders.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateIpFinancialRisk
// Looks at payment_attempts directly by IP cross-referenced from audit_events.
// Since payment_attempts do not store IP, we use orders joined by buyer via
// a subquery on audit_events.
//
// Simplified approach: look at payment_attempts where metadata->>riskLevel
// signals were generated from this IP. Falls back to attempt-level data only.
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateIpFinancialRisk(ip: string): Promise<FinancialRiskSignals> {
  // Find buyer_ids that were seen on this IP in the last 24 h via audit_events
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await sequelize.query<{ actor_user_id: number }>(
    `
    SELECT DISTINCT actor_user_id
    FROM   audit_events
    WHERE  ip_address       = :ip
      AND  actor_user_id IS NOT NULL
      AND  created_at     >= :since
      AND  action LIKE 'order.%' OR action LIKE 'payment.%'
    `,
    {
      replacements: { ip, since: since24h },
      type:         QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) return emptySignals();

  const userIds = rows.map(r => r.actor_user_id);

  const orders = await Order.findAll({
    where: {
      buyer_id:   { [Op.in]: userIds },
      created_at: { [Op.gte]: since24h },
    },
    attributes: ["id", "status"],
  });

  const orderIds = orders.map(o => o.id);
  if (orderIds.length === 0) return emptySignals();

  const attempts = await PaymentAttempt.findAll({
    where: { order_id: { [Op.in]: orderIds } },
    attributes: ["status", "amount_expected"],
  });

  const manualCount = orders.filter(o => o.status === "manual_review").length;
  return buildSignals(attempts, manualCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptySignals(): FinancialRiskSignals {
  return {
    totalAttempts:          0,
    confirmedAttempts:      0,
    failedAttempts:         0,
    failedRatio:            0,
    attemptedAmount:        0,
    confirmedAmount:        0,
    highValueAttemptCount:  0,
    manualReviewOrderCount: 0,
    financialRiskScore:     0,
    signals:                [],
  };
}

function buildSignals(
  attempts:           Array<{ status: string; amount_expected: number }>,
  manualReviewCount:  number,
): FinancialRiskSignals {
  const total      = attempts.length;
  const confirmed  = attempts.filter(a => a.status === "confirmed").length;
  const failed     = attempts.filter(a => a.status === "failed").length;
  const failedRatio = total >= FAILURE_THRESHOLDS.RATIO_MIN_ATTEMPTS
    ? failed / total
    : 0;

  const attemptedAmount = attempts.reduce((s, a) => s + Number(a.amount_expected), 0);
  const confirmedAmount = attempts
    .filter(a => a.status === "confirmed")
    .reduce((s, a) => s + Number(a.amount_expected), 0);

  const highValueCount = attempts.filter(
    a => Number(a.amount_expected) >= FINANCIAL_THRESHOLDS.HIGH_VALUE_ATTEMPT,
  ).length;

  // Score composition
  let score = 0;
  const signals: string[] = [];

  if (failedRatio >= FAILURE_THRESHOLDS.HIGH_FAILURE_RATIO) {
    score += 30;
    signals.push(`high_failure_ratio=${(failedRatio * 100).toFixed(0)}%`);
  } else if (failedRatio >= 0.3) {
    score += 15;
    signals.push(`elevated_failure_ratio=${(failedRatio * 100).toFixed(0)}%`);
  }

  if (highValueCount >= 2) {
    score += 20;
    signals.push(`high_value_attempts=${highValueCount}`);
  } else if (highValueCount === 1) {
    score += 10;
    signals.push(`high_value_attempt=1`);
  }

  if (confirmedAmount >= FINANCIAL_THRESHOLDS.DAILY_CONFIRMED_SPEND_REVIEW) {
    score += 25;
    signals.push(`daily_confirmed_spend=${confirmedAmount}`);
  } else if (confirmedAmount >= FINANCIAL_THRESHOLDS.DAILY_SPEND_ALERT_THRESHOLD) {
    score += 10;
    signals.push(`daily_spend_near_limit=${confirmedAmount}`);
  }

  if (manualReviewCount >= 2) {
    score += 15;
    signals.push(`repeat_manual_review=${manualReviewCount}`);
  }

  if (failed >= FAILURE_THRESHOLDS.BURST_MIN_COUNT) {
    score += 10;
    signals.push(`failure_burst=${failed}`);
  }

  const financialRiskScore = Math.min(100, score);

  return {
    totalAttempts:          total,
    confirmedAttempts:      confirmed,
    failedAttempts:         failed,
    failedRatio,
    attemptedAmount,
    confirmedAmount,
    highValueAttemptCount:  highValueCount,
    manualReviewOrderCount: manualReviewCount,
    financialRiskScore,
    signals,
  };
}
