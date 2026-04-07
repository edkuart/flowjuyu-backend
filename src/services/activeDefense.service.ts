// src/services/activeDefense.service.ts

import { Op, UniqueConstraintError, type WhereOptions } from "sequelize";
import SecurityRestriction, {
  type RestrictionStatus,
  type RestrictionSubjectType,
  type RestrictionType,
} from "../models/SecurityRestriction.model";
import SecurityAlert from "../models/SecurityAlert.model";
import {
  calculateIpRisk,
  calculateUserRisk,
  type RiskResult,
} from "./securityIntelligence.service";
import {
  KYC_DEFENSE_POLICY,
  LOGIN_DEFENSE_POLICY,
  REVIEW_DEFENSE_POLICY,
  type DefenseDecision,
  type DefensePolicy,
  type RestrictionType as PolicyRestrictionType,
} from "../config/securityPolicies";
import type { RiskLevel } from "../config/securityRiskRules";

export interface ActiveDefenseResult {
  decision:           DefenseDecision;
  reason:             string;
  retryAfter?:        number;
  delayMs?:           number;   // only for "throttle" decisions
  restrictionCreated?: boolean;
}

interface RestrictionCreateInput {
  subject_type: RestrictionSubjectType;
  subject_key: string;
  restriction_type: RestrictionType;
  reason: string;
  durationMinutes: number;
  metadata?: Record<string, unknown> | null;
}

const ALERT_LEVEL_BY_SEVERITY: Record<string, RiskLevel> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

const LEVEL_PRIORITY: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function getLevelMax(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_PRIORITY[a] >= LEVEL_PRIORITY[b] ? a : b;
}

function getSubjectKey(value: string | number): string {
  return String(value);
}

function secondsUntil(date: Date | null): number | undefined {
  if (!date) return undefined;
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function restrictionToDecision(restriction: SecurityRestriction): DefenseDecision {
  switch (restriction.restriction_type) {
    case "manual_review_required":
      return "manual_review";
    case "login_cooldown":
      return "cooldown";
    case "review_block":
    case "kyc_block":
      return "deny";
    default:
      return "deny";
  }
}

function restrictionReason(restriction: SecurityRestriction): string {
  return restriction.reason || `Restriction active: ${restriction.restriction_type}`;
}

async function getOpenAlertsForSubjects(subjects: Array<{
  subject_type: RestrictionSubjectType;
  subject_key: string;
}>): Promise<SecurityAlert[]> {
  if (subjects.length === 0) return [];

  const uniqueSubjects = subjects.filter(
    (subject, index, arr) =>
      arr.findIndex(
        (entry) =>
          entry.subject_type === subject.subject_type &&
          entry.subject_key === subject.subject_key,
      ) === index,
  );

  return SecurityAlert.findAll({
    where: {
      status: { [Op.in]: ["open", "acknowledged"] },
      [Op.or]: uniqueSubjects.map((subject) => ({
        subject_type: subject.subject_type,
        subject_key: subject.subject_key,
      })),
    },
    order: [["created_at", "DESC"]],
  });
}

function highestAlertLevel(alerts: SecurityAlert[]): RiskLevel {
  let level: RiskLevel = "low";
  for (const alert of alerts) {
    const next = ALERT_LEVEL_BY_SEVERITY[alert.severity] ?? "low";
    level = getLevelMax(level, next);
  }
  return level;
}

function buildDecisionReason(parts: string[]): string {
  return parts.filter(Boolean).join(" | ");
}

function policyDecision(policy: DefensePolicy, level: RiskLevel) {
  return policy[level];
}

async function evaluateDefense(params: {
  policy:    DefensePolicy;
  policyKey: string;
  subjects:  Array<{ subject_type: RestrictionSubjectType; subject_key: string }>;
  preferredRestrictionSubject: { subject_type: RestrictionSubjectType; subject_key: string };
  userRisk?: Promise<RiskResult>;
  ipRisk:    Promise<RiskResult>;
  manualReviewOnCritical?: boolean;
}): Promise<ActiveDefenseResult> {
  // Centralized expiry: called once here; removed from getActiveRestrictionsForSubject
  // and createRestrictionIfNotExists to avoid redundant calls per evaluation.
  await expireOldRestrictions();

  const activeRestrictionsLists = await Promise.all(
    params.subjects.map((subject) =>
      getActiveRestrictionsForSubject(subject.subject_type, subject.subject_key),
    ),
  );
  const activeRestrictions = activeRestrictionsLists.flat();

  if (activeRestrictions.length > 0) {
    const restriction = activeRestrictions.sort((a, b) => {
      const aPriority = a.restriction_type === "manual_review_required" ? 2 : 1;
      const bPriority = b.restriction_type === "manual_review_required" ? 2 : 1;
      return bPriority - aPriority;
    })[0];

    return {
      decision:           restrictionToDecision(restriction),
      reason:             restrictionReason(restriction),
      // Use actual remaining time from the DB record, not the policy duration.
      retryAfter:         secondsUntil(restriction.expires_at),
      restrictionCreated: false,
    };
  }

  const [ipRisk, userRisk, alerts] = await Promise.all([
    params.ipRisk,
    params.userRisk ?? Promise.resolve<RiskResult | null>(null),
    getOpenAlertsForSubjects(params.subjects),
  ]);

  const alertLevel     = highestAlertLevel(alerts);
  let   effectiveLevel = getLevelMax(ipRisk.level, alertLevel);
  if (userRisk) effectiveLevel = getLevelMax(effectiveLevel, userRisk.level);

  const selectedPolicy = policyDecision(params.policy, effectiveLevel);

  // "allow" and "throttle" both carry no restriction_type — return early without
  // creating a restriction. For throttle, forward the suggested client delay.
  if (selectedPolicy.decision === "allow" || !selectedPolicy.restriction_type) {
    return {
      decision: selectedPolicy.decision,
      ...(selectedPolicy.decision === "throttle" && selectedPolicy.delayMs
        ? { delayMs: selectedPolicy.delayMs }
        : {}),
      reason:   buildDecisionReason([
        userRisk ? `user_risk=${userRisk.level}` : "",
        `ip_risk=${ipRisk.level}`,
        alerts.length ? `open_alerts=${alerts.length}` : "",
      ]) || "No active defense policy triggered",
      restrictionCreated: false,
    };
  }

  const reason = buildDecisionReason([
    `policy_level=${effectiveLevel}`,
    userRisk ? `user_risk=${userRisk.level}` : "",
    `ip_risk=${ipRisk.level}`,
    alerts.length ? `open_alerts=${alerts.length}` : "",
  ]);

  // Choose the restriction subject based on which entity carries the higher risk.
  // When risks are equal or userRisk is unavailable, fall back to the caller-specified
  // preferred subject to preserve existing behaviour.
  let restrictionSubject = params.preferredRestrictionSubject;
  if (userRisk) {
    const ipSubject    = params.subjects.find(s => s.subject_type === "ip");
    const nonIpSubject = params.subjects.find(s => s.subject_type !== "ip");
    if (ipSubject && nonIpSubject) {
      if      (LEVEL_PRIORITY[ipRisk.level]   > LEVEL_PRIORITY[userRisk.level]) restrictionSubject = ipSubject;
      else if (LEVEL_PRIORITY[userRisk.level] > LEVEL_PRIORITY[ipRisk.level])   restrictionSubject = nonIpSubject;
    }
  }

  const newRestriction = await createRestrictionIfNotExists({
    subject_type:     restrictionSubject.subject_type,
    subject_key:      restrictionSubject.subject_key,
    restriction_type: selectedPolicy.restriction_type as RestrictionType,
    reason,
    durationMinutes:  selectedPolicy.durationMinutes,
    metadata: {
      riskLevel: effectiveLevel,
      userRisk:  userRisk ? { score: userRisk.score, level: userRisk.level } : null,
      ipRisk:    { score: ipRisk.score, level: ipRisk.level },
      policyKey: params.policyKey,
      alertIds:  alerts.map((alert) => alert.id),
    },
  });

  return {
    decision:           selectedPolicy.decision,
    reason,
    // Use the actual expires_at of the created restriction for accurate retryAfter.
    // Falls back to undefined on race-condition no-op (newRestriction === null).
    retryAfter:         newRestriction ? secondsUntil(newRestriction.expires_at) : undefined,
    restrictionCreated: newRestriction !== null,
  };
}

export async function getActiveRestrictionsForSubject(
  subject_type: RestrictionSubjectType,
  subject_key: string,
  restrictionTypes?: RestrictionType[],
): Promise<SecurityRestriction[]> {
  const where: WhereOptions = {
    subject_type,
    subject_key,
    status: "active" satisfies RestrictionStatus,
    [Op.or]: [
      { expires_at: null },
      { expires_at: { [Op.gt]: new Date() } },
    ],
  };

  if (restrictionTypes?.length) {
    Object.assign(where, {
      restriction_type: { [Op.in]: restrictionTypes },
    });
  }

  return SecurityRestriction.findAll({
    where,
    order: [["created_at", "DESC"]],
  });
}

export async function createRestrictionIfNotExists(
  input: RestrictionCreateInput,
): Promise<SecurityRestriction | null> {
  // expireOldRestrictions() is NOT called here — it is called once in evaluateDefense
  // before this function is ever reached, keeping expiry calls centralized.

  const existing = await SecurityRestriction.findOne({
    where: {
      subject_type:     input.subject_type,
      subject_key:      input.subject_key,
      restriction_type: input.restriction_type,
      status:           "active",
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } },
      ],
    },
  });

  if (existing) return null;

  try {
    return await SecurityRestriction.create({
      subject_type:     input.subject_type,
      subject_key:      input.subject_key,
      restriction_type: input.restriction_type,
      reason:           input.reason,
      status:           "active",
      expires_at:       input.durationMinutes > 0
        ? new Date(Date.now() + input.durationMinutes * 60 * 1000)
        : null,
      metadata:         input.metadata ?? null,
    });
  } catch (err) {
    // DB-level unique constraint (if present) fires when two concurrent evaluations
    // pass the findOne check simultaneously. Treat as a safe no-op.
    if (err instanceof UniqueConstraintError) return null;
    throw err;
  }
}

export async function expireOldRestrictions(): Promise<number> {
  const [affected] = await SecurityRestriction.update(
    { status: "expired" },
    {
      where: {
        status: "active",
        expires_at: {
          [Op.lte]: new Date(),
        },
      },
    },
  );

  return affected;
}

export async function evaluateLoginDefense({
  ip,
  email: _email,
  userId,
}: {
  ip: string;
  email: string;
  userId?: number;
}): Promise<ActiveDefenseResult> {
  const subjects: Array<{ subject_type: RestrictionSubjectType; subject_key: string }> = [
    { subject_type: "ip", subject_key: getSubjectKey(ip) },
  ];

  if (typeof userId === "number") {
    subjects.push({ subject_type: "user", subject_key: getSubjectKey(userId) });
  }

  return evaluateDefense({
    policy:    LOGIN_DEFENSE_POLICY,
    policyKey: "login",
    subjects,
    preferredRestrictionSubject: { subject_type: "ip", subject_key: getSubjectKey(ip) },
    userRisk: typeof userId === "number" ? calculateUserRisk(userId) : undefined,
    ipRisk:   calculateIpRisk(ip),
  });
}

export async function evaluateReviewDefense({
  userId,
  ip,
}: {
  userId: number;
  ip: string;
}): Promise<ActiveDefenseResult> {
  return evaluateDefense({
    policy:    REVIEW_DEFENSE_POLICY,
    policyKey: "review",
    subjects: [
      { subject_type: "user", subject_key: getSubjectKey(userId) },
      { subject_type: "ip",   subject_key: getSubjectKey(ip) },
    ],
    preferredRestrictionSubject: { subject_type: "user", subject_key: getSubjectKey(userId) },
    userRisk: calculateUserRisk(userId),
    ipRisk:   calculateIpRisk(ip),
  });
}

export async function evaluateKycDefense({
  userId,
  ip,
}: {
  userId: number;
  ip: string;
}): Promise<ActiveDefenseResult> {
  return evaluateDefense({
    policy:    KYC_DEFENSE_POLICY,
    policyKey: "kyc",
    subjects: [
      { subject_type: "seller", subject_key: getSubjectKey(userId) },
      { subject_type: "user",   subject_key: getSubjectKey(userId) },
      { subject_type: "ip",     subject_key: getSubjectKey(ip) },
    ],
    preferredRestrictionSubject: { subject_type: "seller", subject_key: getSubjectKey(userId) },
    userRisk: calculateUserRisk(userId),
    ipRisk:   calculateIpRisk(ip),
  });
}

