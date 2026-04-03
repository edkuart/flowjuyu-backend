// src/services/securityIntelligence.service.ts
//
// Security intelligence layer — reads audit_events to score risk, detect
// suspicious patterns, and write security_alerts.
//
// Design rules:
//   - All functions are safe to call in fire-and-forget mode (no throws).
//   - createAlertIfNotExists() is idempotent per (type, subject_type, subject_key).
//   - No user data is modified — this phase is read + alert only.

import { Op, QueryTypes, UniqueConstraintError } from "sequelize";
import { sequelize } from "../config/db";
import AuditEvent from "../models/AuditEvent.model";
import SecurityAlert from "../models/SecurityAlert.model";
import {
  RISK_WEIGHTS,
  SECURITY_PATTERN_RULES,
  scoreToLevel,
  type RiskLevel,
} from "../config/securityRiskRules";

// ─────────────────────────────────────────────────────────────────────────────
// Risk result shape
// ─────────────────────────────────────────────────────────────────────────────
export interface RiskResult {
  score:   number;
  level:   RiskLevel;
  signals: Array<{ action: string; count: number; weight: number; contribution: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateUserRisk
//
// Sums weighted audit events for a given actor_user_id
// over the last 24 hours.
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateUserRisk(userId: number): Promise<RiskResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await AuditEvent.findAll({
    where: {
      actor_user_id: userId,
      action:        { [Op.in]: Object.keys(RISK_WEIGHTS) },
      created_at:    { [Op.gte]: since },
    },
    attributes: [
      "action",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["action"],
    raw:   true,
  }) as unknown as Array<{ action: string; count: string }>;

  return buildRiskResult(rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateIpRisk
//
// Sums weighted audit events for a given ip_address
// over the last 24 hours.
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateIpRisk(ip: string): Promise<RiskResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await AuditEvent.findAll({
    where: {
      ip_address: ip,
      action:     { [Op.in]: Object.keys(RISK_WEIGHTS) },
      created_at: { [Op.gte]: since },
    },
    attributes: [
      "action",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["action"],
    raw:   true,
  }) as unknown as Array<{ action: string; count: string }>;

  return buildRiskResult(rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: build RiskResult from a grouped action-count array
// ─────────────────────────────────────────────────────────────────────────────
function buildRiskResult(rows: Array<{ action: string; count: string }>): RiskResult {
  let score = 0;
  const signals: RiskResult["signals"] = [];

  for (const row of rows) {
    const weight = RISK_WEIGHTS[row.action] ?? 0;
    const count  = Number(row.count);
    const contribution = weight * count;
    score += contribution;
    signals.push({ action: row.action, count, weight, contribution });
  }

  signals.sort((a, b) => b.contribution - a.contribution);

  return { score, level: scoreToLevel(score), signals };
}

// ─────────────────────────────────────────────────────────────────────────────
// detectLoginBurstPatterns
//
// Finds IPs with ≥ rule.minCount login-failed/blocked events in windowMs.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectLoginBurstPatterns(): Promise<void> {
  const rule = SECURITY_PATTERN_RULES.find(r => r.name === "suspicious_login_burst")!;
  const since = new Date(Date.now() - rule.windowMs);

  const rows = await sequelize.query<{ ip_address: string; event_count: string }>(
    `
    SELECT ip_address, COUNT(id)::text AS event_count
    FROM   audit_events
    WHERE  action    = ANY(:actions)
      AND  created_at >= :since
    GROUP  BY ip_address
    HAVING COUNT(id) >= :minCount
    `,
    {
      replacements: { actions: rule.actions, since, minCount: rule.minCount },
      type: QueryTypes.SELECT,
    }
  );

  for (const row of rows) {
    await createAlertIfNotExists({
      type:         rule.alertType,
      severity:     rule.severity,
      subject_type: "ip",
      subject_key:  row.ip_address,
      title:        `Login burst detected from IP ${row.ip_address}`,
      description:  rule.description,
      metadata:     { event_count: Number(row.event_count), window_minutes: rule.windowMs / 60000 },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectReviewAbusePatterns
//
// Detects users with too many blocked/duplicate/mismatch review events.
// Groups by actor_user_id first; falls back to ip_address for unauthenticated.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectReviewAbusePatterns(): Promise<void> {
  const rule = SECURITY_PATTERN_RULES.find(r => r.name === "review_abuse_pattern")!;
  const since = new Date(Date.now() - rule.windowMs);

  // By user
  const byUser = await sequelize.query<{ actor_user_id: string; event_count: string }>(
    `
    SELECT actor_user_id::text, COUNT(id)::text AS event_count
    FROM   audit_events
    WHERE  action    = ANY(:actions)
      AND  created_at >= :since
      AND  actor_user_id IS NOT NULL
    GROUP  BY actor_user_id
    HAVING COUNT(id) >= :minCount
    `,
    {
      replacements: { actions: rule.actions, since, minCount: rule.minCount },
      type: QueryTypes.SELECT,
    }
  );

  for (const row of byUser) {
    await createAlertIfNotExists({
      type:         rule.alertType,
      severity:     rule.severity,
      subject_type: "user",
      subject_key:  row.actor_user_id,
      title:        `Review abuse pattern detected for user ${row.actor_user_id}`,
      description:  rule.description,
      metadata:     { event_count: Number(row.event_count), window_minutes: rule.windowMs / 60000 },
    });
  }

  // By IP (catches anonymous or multi-account abuse)
  const byIp = await sequelize.query<{ ip_address: string; event_count: string }>(
    `
    SELECT ip_address, COUNT(id)::text AS event_count
    FROM   audit_events
    WHERE  action    = ANY(:actions)
      AND  created_at >= :since
    GROUP  BY ip_address
    HAVING COUNT(id) >= :minCount
    `,
    {
      replacements: { actions: rule.actions, since, minCount: rule.minCount },
      type: QueryTypes.SELECT,
    }
  );

  for (const row of byIp) {
    await createAlertIfNotExists({
      type:         rule.alertType,
      severity:     rule.severity,
      subject_type: "ip",
      subject_key:  row.ip_address,
      title:        `Review abuse pattern detected from IP ${row.ip_address}`,
      description:  rule.description,
      metadata:     { event_count: Number(row.event_count), window_minutes: rule.windowMs / 60000 },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectKycAbusePatterns
//
// Detects users with repeated KYC failures/blocks — may indicate evasion attempts.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectKycAbusePatterns(): Promise<void> {
  const rule = SECURITY_PATTERN_RULES.find(r => r.name === "kyc_evasion_pattern")!;
  const since = new Date(Date.now() - rule.windowMs);

  const rows = await sequelize.query<{ actor_user_id: string; event_count: string }>(
    `
    SELECT actor_user_id::text, COUNT(id)::text AS event_count
    FROM   audit_events
    WHERE  action    = ANY(:actions)
      AND  created_at >= :since
      AND  actor_user_id IS NOT NULL
    GROUP  BY actor_user_id
    HAVING COUNT(id) >= :minCount
    `,
    {
      replacements: { actions: rule.actions, since, minCount: rule.minCount },
      type: QueryTypes.SELECT,
    }
  );

  for (const row of rows) {
    await createAlertIfNotExists({
      type:         rule.alertType,
      severity:     rule.severity,
      subject_type: "user",
      subject_key:  row.actor_user_id,
      title:        `KYC evasion pattern detected for user ${row.actor_user_id}`,
      description:  rule.description,
      metadata:     { event_count: Number(row.event_count), window_minutes: rule.windowMs / 60000 },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectCrossSurfaceAbuse
//
// Finds IPs that appear in abuse events across multiple action surfaces
// (login + review + KYC) within the rule window.
// Requires at least 2 distinct surfaces AND total count ≥ rule.minCount.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectCrossSurfaceAbuse(): Promise<void> {
  const rule = SECURITY_PATTERN_RULES.find(r => r.name === "cross_surface_abuse")!;
  const since = new Date(Date.now() - rule.windowMs);

  // Map action → surface name for surface-count grouping
  const surfaceMap: Record<string, string> = {
    "auth.login.failed":                  "login",
    "auth.login.blocked":                 "login",
    "review.create.blocked":              "review",
    "review.create.duplicate_blocked":    "review",
    "review.create.mismatch_blocked":     "review",
    "seller.kyc.upload.failed":           "kyc",
    "seller.kyc.upload.blocked":          "kyc",
  };

  const rows = await sequelize.query<{
    ip_address:     string;
    total_events:   string;
    distinct_actions: string;
  }>(
    `
    SELECT
      ip_address,
      COUNT(id)::text                       AS total_events,
      COUNT(DISTINCT action)::text          AS distinct_actions
    FROM   audit_events
    WHERE  action    = ANY(:actions)
      AND  created_at >= :since
    GROUP  BY ip_address
    HAVING COUNT(id) >= :minCount
    `,
    {
      replacements: { actions: rule.actions, since, minCount: rule.minCount },
      type: QueryTypes.SELECT,
    }
  );

  // Filter to IPs that span at least 2 surfaces
  for (const row of rows) {
    // Fetch the distinct actions for this IP to determine surface spread
    const actionRows = await sequelize.query<{ action: string }>(
      `
      SELECT DISTINCT action
      FROM   audit_events
      WHERE  ip_address = :ip
        AND  action     = ANY(:actions)
        AND  created_at >= :since
      `,
      {
        replacements: { ip: row.ip_address, actions: rule.actions, since },
        type: QueryTypes.SELECT,
      }
    );

    const surfaces = new Set(actionRows.map(a => surfaceMap[a.action]).filter(Boolean));
    if (surfaces.size < 2) continue;

    await createAlertIfNotExists({
      type:         rule.alertType,
      severity:     rule.severity,
      subject_type: "ip",
      subject_key:  row.ip_address,
      title:        `Cross-surface abuse detected from IP ${row.ip_address}`,
      description:  rule.description,
      metadata:     {
        total_events:    Number(row.total_events),
        surfaces_hit:    Array.from(surfaces),
        window_minutes:  rule.windowMs / 60000,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// detectAdminSensitiveAccessPatterns
//
// Detects admins performing unusually high volume of sensitive actions.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectAdminSensitiveAccessPatterns(): Promise<void> {
  const rule = SECURITY_PATTERN_RULES.find(r => r.name === "admin_high_volume_sensitive_access")!;
  const since = new Date(Date.now() - rule.windowMs);

  const rows = await sequelize.query<{ actor_user_id: string; event_count: string }>(
    `
    SELECT actor_user_id::text, COUNT(id)::text AS event_count
    FROM   audit_events
    WHERE  action    = ANY(:actions)
      AND  actor_role = 'admin'
      AND  created_at >= :since
      AND  actor_user_id IS NOT NULL
    GROUP  BY actor_user_id
    HAVING COUNT(id) >= :minCount
    `,
    {
      replacements: { actions: rule.actions, since, minCount: rule.minCount },
      type: QueryTypes.SELECT,
    }
  );

  for (const row of rows) {
    await createAlertIfNotExists({
      type:         rule.alertType,
      severity:     rule.severity,
      subject_type: "admin",
      subject_key:  row.actor_user_id,
      title:        `High-volume sensitive admin actions from admin ${row.actor_user_id}`,
      description:  rule.description,
      metadata:     { event_count: Number(row.event_count), window_minutes: rule.windowMs / 60000 },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createAlertIfNotExists
//
// Idempotent alert creation.
// Does NOT insert if an alert with same (type, subject_type, subject_key)
// already exists in "open" or "acknowledged" state.
// ─────────────────────────────────────────────────────────────────────────────
interface CreateAlertInput {
  type:         string;
  severity:     "low" | "medium" | "high" | "critical";
  subject_type: string;
  subject_key:  string;
  title:        string;
  description:  string;
  metadata?:    Record<string, unknown> | null;
}

export async function createAlertIfNotExists(input: CreateAlertInput): Promise<void> {
  try {
    // Fast path: skip the INSERT entirely if an active alert already exists.
    // This avoids unnecessary write contention on the unique index under concurrent scans.
    const existing = await SecurityAlert.findOne({
      where: {
        type:         input.type,
        subject_type: input.subject_type,
        subject_key:  input.subject_key,
        status:       { [Op.in]: ["open", "acknowledged"] },
      },
    });

    if (existing) return;

    await SecurityAlert.create({
      type:         input.type,
      severity:     input.severity,
      subject_type: input.subject_type,
      subject_key:  input.subject_key,
      status:       "open",
      title:        input.title,
      description:  input.description,
      metadata:     input.metadata ?? null,
    });
  } catch (err) {
    // DB-level deduplication: the partial unique index idx_sec_alerts_active_dedup
    // enforces uniqueness on (type, subject_type, subject_key) for open/acknowledged
    // alerts. A concurrent insert from a parallel detector will hit this constraint.
    // Treat it as a successful no-op — the alert already exists.
    if (err instanceof UniqueConstraintError) return;

    console.error("[security] Failed to create alert:", {
      type:    input.type,
      subject: `${input.subject_type}:${input.subject_key}`,
      error:   (err as Error)?.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateSecurityAlerts
//
// Master runner — executes all detectors in parallel.
// Returns a summary of how many alerts were created.
// Safe to call from a cron, admin endpoint, or boot script.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateSecurityAlerts(): Promise<{
  ok:      boolean;
  message: string;
}> {
  try {
    const countBefore = await SecurityAlert.count({ where: { status: "open" } });

    await Promise.all([
      detectLoginBurstPatterns(),
      detectReviewAbusePatterns(),
      detectKycAbusePatterns(),
      detectCrossSurfaceAbuse(),
      detectAdminSensitiveAccessPatterns(),
    ]);

    const countAfter = await SecurityAlert.count({ where: { status: "open" } });
    const created    = countAfter - countBefore;

    return {
      ok:      true,
      message: `Security scan complete. ${created} new alert(s) created.`,
    };
  } catch (err) {
    console.error("[security] generateSecurityAlerts failed:", (err as Error)?.message);
    return { ok: false, message: "Security scan failed — see server logs." };
  }
}
