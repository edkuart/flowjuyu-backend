// src/config/securityRules.ts

export interface AbuseRule {
  windowMinutes: number;
  maxAttempts: number;
  blockDurationMinutes: number;
}

export const LOGIN_RULES: AbuseRule = {
  windowMinutes:        15,
  maxAttempts:          10,
  blockDurationMinutes: 30,
};

export const REVIEW_RULES: AbuseRule = {
  windowMinutes:        60,
  maxAttempts:          5,
  blockDurationMinutes: 120,
};

export const KYC_RULES: AbuseRule = {
  windowMinutes:        60,
  maxAttempts:          3,
  blockDurationMinutes: 180,
};

