// src/services/abuseDetection.service.ts

import { Op, type WhereOptions } from "sequelize";
import AuditEvent from "../models/AuditEvent.model";
import {
  LOGIN_RULES,
  REVIEW_RULES,
  KYC_RULES,
  type AbuseRule,
} from "../config/securityRules";

export interface AbuseCheckResult {
  blocked: boolean;
  reason: string;
  retryAfter?: number;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

async function latestBlockedEvent(params: {
  action: string;
  actor_user_id?: number;
  ip_address?: string;
}): Promise<AuditEvent | null> {
  const where: WhereOptions = {
    action: params.action,
    status: "blocked",
  };

  const identityFilters: WhereOptions[] = [];
  if (typeof params.actor_user_id === "number") {
    identityFilters.push({ actor_user_id: params.actor_user_id });
  }
  if (params.ip_address) {
    identityFilters.push({ ip_address: params.ip_address });
  }

  if (identityFilters.length === 1) {
    Object.assign(where, identityFilters[0]);
  } else if (identityFilters.length > 1) {
    Object.assign(where, { [Op.or]: identityFilters });
  }

  return AuditEvent.findOne({
    where,
    order: [["created_at", "DESC"]],
  });
}

async function isStillBlocked(params: {
  action: string;
  actor_user_id?: number;
  ip_address?: string;
  blockDurationMinutes: number;
}): Promise<number | null> {
  const lastBlock = await latestBlockedEvent(params);
  if (!lastBlock?.created_at) return null;

  const unblockAt = new Date(
    new Date(lastBlock.created_at).getTime() + params.blockDurationMinutes * 60 * 1000,
  );

  if (unblockAt <= new Date()) return null;
  return secondsUntil(unblockAt);
}

async function countAttempts(where: WhereOptions): Promise<number> {
  return AuditEvent.count({ where });
}

async function evaluateThreshold(params: {
  blockedAction: string;
  actor_user_id?: number;
  ip_address?: string;
  rule: AbuseRule;
  attemptsWhere: WhereOptions;
  reason: string;
}): Promise<AbuseCheckResult> {
  const activeBlockRetryAfter = await isStillBlocked({
    action: params.blockedAction,
    actor_user_id: params.actor_user_id,
    ip_address: params.ip_address,
    blockDurationMinutes: params.rule.blockDurationMinutes,
  });

  if (activeBlockRetryAfter) {
    return {
      blocked:    true,
      reason:     params.reason,
      retryAfter: activeBlockRetryAfter,
    };
  }

  const attempts = await countAttempts(params.attemptsWhere);
  if (attempts < params.rule.maxAttempts) {
    return {
      blocked: false,
      reason:  "",
    };
  }

  return {
    blocked:    true,
    reason:     params.reason,
    retryAfter: secondsUntil(minutesFromNow(params.rule.blockDurationMinutes)),
  };
}

export async function checkLoginAbuse({
  ip,
  email,
}: {
  ip: string;
  email?: string | null;
}): Promise<AbuseCheckResult> {
  const since = minutesAgo(LOGIN_RULES.windowMinutes);
  const attemptsWhere: WhereOptions = {
    action:     "auth.login.failed",
    created_at: { [Op.gte]: since },
    [Op.or]: [
      { ip_address: ip },
      ...(email
        ? [{
            metadata: {
              [Op.contains]: { email },
            },
          }]
        : []),
    ],
  };
  const ipOnlyAttemptsWhere: WhereOptions = {
    action:     "auth.login.failed",
    created_at: { [Op.gte]: since },
    ip_address: ip,
  };

  const existingBlock = await evaluateThreshold({
    blockedAction: "auth.login.blocked",
    ip_address:    ip,
    rule:          LOGIN_RULES,
    attemptsWhere,
    reason:        "Too many failed login attempts",
  });

  if (existingBlock.blocked) return existingBlock;

  return evaluateThreshold({
    blockedAction: "auth.login.blocked",
    ip_address:    ip,
    rule:          LOGIN_RULES,
    attemptsWhere: ipOnlyAttemptsWhere,
    reason:        "Too many failed login attempts from this IP",
  });
}

export async function checkReviewAbuse({
  userId,
  ip,
}: {
  userId: number;
  ip: string;
}): Promise<AbuseCheckResult> {
  const since = minutesAgo(REVIEW_RULES.windowMinutes);
  const attemptsWhere: WhereOptions = {
    created_at:    { [Op.gte]: since },
    action:        { [Op.like]: "review.create.%" },
    status:        { [Op.in]: ["success", "denied", "blocked"] },
    [Op.or]: [
      { actor_user_id: userId },
      { ip_address: ip },
    ],
  };

  return evaluateThreshold({
    blockedAction: "review.create.blocked",
    actor_user_id: userId,
    ip_address:    ip,
    rule:          REVIEW_RULES,
    attemptsWhere,
    reason:        "Too many review attempts",
  });
}

export async function checkKycAbuse({
  userId,
  ip,
}: {
  userId: number;
  ip: string;
}): Promise<AbuseCheckResult> {
  const since = minutesAgo(KYC_RULES.windowMinutes);
  const attemptsWhere: WhereOptions = {
    created_at: { [Op.gte]: since },
    action:     { [Op.in]: ["seller.kyc.upload.failed", "seller.kyc.revalidate.failed"] },
    [Op.or]: [
      { actor_user_id: userId },
      { ip_address: ip },
    ],
  };

  return evaluateThreshold({
    blockedAction: "seller.kyc.upload.blocked",
    actor_user_id: userId,
    ip_address:    ip,
    rule:          KYC_RULES,
    attemptsWhere,
    reason:        "Too many failed KYC upload attempts",
  });
}
