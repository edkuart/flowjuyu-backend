// src/config/securityPolicies.ts

import type { RiskLevel } from "./securityRiskRules";

export type DefenseDecision = "allow" | "cooldown" | "deny" | "manual_review" | "throttle";
export type RestrictionType =
  | "login_cooldown"
  | "review_block"
  | "kyc_block"
  | "manual_review_required";

export interface DefensePolicyEntry {
  decision:         DefenseDecision;
  restriction_type: RestrictionType | null;
  durationMinutes:  number;
  /** For "throttle" decisions: suggested client delay in milliseconds (no restriction created). */
  delayMs?: number;
}

export type DefensePolicy = Record<RiskLevel, DefensePolicyEntry>;

export const LOGIN_DEFENSE_POLICY: DefensePolicy = {
  low: {
    decision: "allow",
    restriction_type: null,
    durationMinutes: 0,
  },
  medium: {
    decision:         "throttle",
    restriction_type: null,
    durationMinutes:  0,
    delayMs:          3000,
  },
  high: {
    decision: "cooldown",
    restriction_type: "login_cooldown",
    durationMinutes: 30,
  },
  critical: {
    decision: "deny",
    restriction_type: "login_cooldown",
    durationMinutes: 120,
  },
};

export const REVIEW_DEFENSE_POLICY: DefensePolicy = {
  low: {
    decision:         "allow",
    restriction_type: null,
    durationMinutes:  0,
  },
  medium: {
    decision:         "throttle",
    restriction_type: null,
    durationMinutes:  0,
    delayMs:          2000,
  },
  high: {
    decision: "cooldown",
    restriction_type: "review_block",
    durationMinutes: 60,
  },
  critical: {
    decision: "deny",
    restriction_type: "review_block",
    durationMinutes: 240,
  },
};

export const KYC_DEFENSE_POLICY: DefensePolicy = {
  low: {
    decision: "allow",
    restriction_type: null,
    durationMinutes: 0,
  },
  medium: {
    decision: "allow",
    restriction_type: null,
    durationMinutes: 0,
  },
  high: {
    decision: "cooldown",
    restriction_type: "kyc_block",
    durationMinutes: 120,
  },
  critical: {
    decision: "manual_review",
    restriction_type: "manual_review_required",
    durationMinutes: 24 * 60,
  },
};

