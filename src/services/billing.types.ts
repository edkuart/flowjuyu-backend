import type SellerInvoice from "../models/SellerInvoice.model";
import type SellerInvoiceItem from "../models/SellerInvoiceItem.model";
import type SellerBillingPayment from "../models/SellerBillingPayment.model";
import type SellerManualPaymentReport from "../models/SellerManualPaymentReport.model";
import type { ManualPaymentReportStatus } from "../models/SellerManualPaymentReport.model";
import type SellerSubscription from "../models/SellerSubscription.model";
import type { BillingCycle } from "../models/SellerSubscription.model";
import type { BillingProvider, BillingPaymentStatus } from "../models/SellerBillingPayment.model";

export type GenerateInvoiceReason = "initial_subscription" | "renewal";

export interface GenerateInvoiceInput {
  sellerId: number;
  subscriptionId: number;
  reason: GenerateInvoiceReason;
  actorUserId?: number | null;
  actorRole?: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GenerateInvoiceResult {
  invoice: SellerInvoice;
  items: SellerInvoiceItem[];
  reused: boolean;
}

export interface CreateSubscriptionInput {
  sellerId: number;
  planId: number;
  billingCycle: BillingCycle;
  autoRenew?: boolean;
  actorUserId?: number | null;
  actorRole?: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateSubscriptionResult {
  subscription: SellerSubscription;
  invoice: SellerInvoice;
  invoiceItems: SellerInvoiceItem[];
  reusedSubscription: boolean;
  reusedInvoice: boolean;
}

export interface GeneratePaymentLinkInput {
  invoiceId: number;
  provider: BillingProvider;
  actorUserId?: number | null;
  actorRole?: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GeneratePaymentLinkResult {
  payment: SellerBillingPayment;
  reused: boolean;
  paymentLink: string | null;
  linkExpiresAt: Date | null;
  providerReference: string | null;
  paymentMethodDetail: string | null;
  instructions: Record<string, unknown> | null;
}

export interface ActivateSubscriptionInput {
  paymentId: number;
  confirmedAt?: Date;
  confirmedBy?: number | null;
  paymentMethodDetail?: string | null;
  providerReference?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  actorUserId?: number | null;
  actorRole?: string;
}

export interface ActivateSubscriptionResult {
  subscription: SellerSubscription;
  invoice: SellerInvoice;
  payment: SellerBillingPayment;
  alreadyActivated: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface ReportManualPaymentInput {
  sellerId: number;
  paymentId: number;
  bankName: string;
  depositReference: string;
  depositorName: string;
  depositDate: string;
  reportedAmount: number;
  currency: string;
  receiptFileUrl?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  actorUserId?: number | null;
  actorRole?: string;
}

export interface ReportManualPaymentResult {
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  report: SellerManualPaymentReport;
}

export interface InvoiceItemDraft {
  description: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  periodStart: string | null;
  periodEnd: string | null;
  featureKey: string | null;
  metadata: Record<string, unknown> | null;
}

export interface InvoiceIdentityScope {
  type: "subscription";
  sellerId: number;
  subscriptionId: number;
  reason: GenerateInvoiceReason;
  billingCycle: BillingCycle;
  currency: string;
  priceAtSignup: number;
  periodStart: string;
  periodEnd: string;
}

export interface BillingProviderSession {
  providerReference: string | null;
  paymentLink: string | null;
  linkExpiresAt: Date | null;
  paymentMethodDetail: string | null;
  initialStatus: BillingPaymentStatus;
  instructions: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

// ─── Phase 3: Manual Payment Admin Review ────────────────────────────────────

export interface MarkManualPaymentUnderReviewInput {
  reportId: number;
  adminId: number;
  actorUserId?: number | null;
  actorRole?: string;
  notes?: string | null;
}

export interface MarkManualPaymentUnderReviewResult {
  report: SellerManualPaymentReport;
  alreadyUnderReview: boolean;
}

export interface ApproveManualPaymentInput {
  reportId: number;
  adminId: number;
  notes?: string | null;
  actorUserId?: number | null;
  actorRole?: string;
}

export interface ApproveManualPaymentResult {
  report: SellerManualPaymentReport;
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  subscription: SellerSubscription;
  alreadyApproved: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface RejectManualPaymentInput {
  reportId: number;
  adminId: number;
  rejectionReason: string;
  notes?: string | null;
  actorUserId?: number | null;
  actorRole?: string;
}

export interface RejectManualPaymentResult {
  report: SellerManualPaymentReport;
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  alreadyRejected: boolean;
}

export interface GetManualPaymentReportDetailInput {
  reportId: number;
  /** If provided, the report must belong to this seller (seller access guard). */
  sellerId?: number;
}

export interface ManualPaymentReportDetail {
  report: SellerManualPaymentReport;
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  invoiceItems: SellerInvoiceItem[];
}

export interface ListManualPaymentReportsInput {
  status?: ManualPaymentReportStatus | null;
  sellerId?: number | null;
  invoiceId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
}

export interface ListManualPaymentReportsResult {
  reports: SellerManualPaymentReport[];
  total: number;
}

// ─── Renewal Cron ─────────────────────────────────────────────────────────────

export interface RenewalCronResult {
  /** ISO timestamp when this cron run started. */
  runAt: string;
  pass1: {
    /** Subscriptions scanned for renewal invoice generation. */
    scanned: number;
    /** Invoices newly created. */
    invoicesCreated: number;
    /** Invoices reused (already existed — idempotent replay). */
    invoicesReused: number;
    /** Subscriptions skipped (no action needed). */
    skipped: number;
    /** Subscriptions that threw errors during invoice generation. */
    errors: number;
  };
  pass2: {
    /** Subscriptions scanned for expiry. */
    scanned: number;
    /** Subscriptions transitioned active → past_due. */
    markedPastDue: number;
    /** Subscriptions transitioned active|past_due → expired. */
    markedExpired: number;
    /** Subscriptions skipped (already in target state or has active payment). */
    skipped: number;
    /** Subscriptions that threw errors during state transition. */
    errors: number;
  };
}

export class BillingValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BillingValidationError";
  }
}

export class BillingDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BillingDomainError";
  }
}
