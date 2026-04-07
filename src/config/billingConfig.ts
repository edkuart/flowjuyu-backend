// src/config/billingConfig.ts
//
// Central configuration for Seller Billing.
// All time values are in days unless noted otherwise.

export const BILLING_CONFIG = {
  /** Days from invoice creation until it is due. */
  INVOICE_DUE_DAYS: 3,
  /** Days after current_period_end before a past_due subscription expires. */
  GRACE_PERIOD_DAYS: 7,
  /** Days before current_period_end to generate a renewal invoice. */
  RENEWAL_NOTICE_DAYS: 7,
  /** Hours until a generated payment link expires. */
  LINK_EXPIRY_HOURS: 48,
  /** Days in a monthly billing period. */
  PERIOD_DAYS_MONTHLY: 30,
  /** Days in a yearly billing period. */
  PERIOD_DAYS_YEARLY: 365,
  /** Default currency for all billing operations. */
  DEFAULT_CURRENCY: "GTQ",
  /** IVA tax rate (12% in Guatemala). Set to 0 in V1 — reserved for future. */
  TAX_RATE: 0,
} as const;
