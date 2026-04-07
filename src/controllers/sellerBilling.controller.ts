// src/controllers/sellerBilling.controller.ts
//
// Seller-facing billing endpoints.
// All handlers bind sellerId = req.user!.id from the verified JWT.
// Ownership is enforced at the service / helper layer — never from query params.
//
// Security invariants:
//   • Single-resource reads use WHERE id=? AND seller_id=? → 404 on mismatch
//     (no 403 to avoid confirming the resource exists for other sellers).
//   • provider_link and failure_reason are only in detail responses.
//   • metadata, notes (internal), confirmed_by, reviewed_by are never returned.

import type { Request, Response } from "express";
import {
  createSubscription,
  generateInvoice,
  generatePaymentLink,
  getManualPaymentReportDetail,
  listManualPaymentReports,
  reportManualPayment,
} from "../services/billing.service";
import {
  getSellerCurrentSubscription,
  listSellerInvoices,
  getSellerInvoiceDetail,
  listSellerPayments,
  getSellerPaymentDetail,
} from "../services/billing.helpers";
import { BillingDomainError, BillingValidationError } from "../services/billing.types";
import type { BillingCycle } from "../models/SellerSubscription.model";
import type { BillingProvider } from "../models/SellerBillingPayment.model";
import type SellerSubscription from "../models/SellerSubscription.model";
import type SellerPlan from "../models/SellerPlan.model";
import type SellerInvoice from "../models/SellerInvoice.model";
import type SellerInvoiceItem from "../models/SellerInvoiceItem.model";
import type SellerBillingPayment from "../models/SellerBillingPayment.model";
import type SellerManualPaymentReport from "../models/SellerManualPaymentReport.model";

// ─── Error → HTTP mapping ─────────────────────────────────────────────────────

function handleBillingError(err: unknown, res: Response): void {
  if (err instanceof BillingValidationError) {
    res.status(400).json({ ok: false, code: err.code, message: err.message });
    return;
  }
  if (err instanceof BillingDomainError) {
    const status = DOMAIN_ERROR_STATUS[err.code] ?? 422;
    res.status(status).json({ ok: false, code: err.code, message: err.message });
    return;
  }
  throw err; // re-throw system errors to global errorHandler
}

const DOMAIN_ERROR_STATUS: Record<string, number> = {
  SELLER_NOT_FOUND:                404,
  PLAN_NOT_FOUND:                  404,
  PAYMENT_NOT_FOUND:               404,
  INVOICE_NOT_FOUND:               404,
  REPORT_NOT_FOUND:                404,
  PAYMENT_SELLER_MISMATCH:         403,
  INVOICE_SELLER_MISMATCH:         403,
  PLAN_NOT_ACTIVE:                 409,
  ACTIVE_SUBSCRIPTION_FLOW_EXISTS: 409,
  DRAFT_SUBSCRIPTION_CONFLICT:     409,
  INVOICE_HAS_CONFIRMED_PAYMENT:   409,
  DUPLICATE_MANUAL_PAYMENT_REPORT: 409,
  PAYMENT_ALREADY_CONFIRMED:       409,
  PAYMENT_NOT_REPORTABLE:          409,
};

// ─── Pagination helpers ───────────────────────────────────────────────────────

function parsePaginationQuery(query: Record<string, string | undefined>): {
  limit: number;
  offset: number;
} {
  const limit  = Math.min(Math.max(Number(query.limit  ?? 20), 1), 50);
  const offset = Math.max(Number(query.offset ?? 0), 0);
  return { limit, offset };
}

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializeSubscription(sub: SellerSubscription) {
  return {
    id:                 sub.id,
    status:             sub.status,
    planId:             sub.plan_id,
    billingCycle:       sub.billing_cycle,
    priceAtSignup:      Number(sub.price_at_signup),
    currency:           sub.currency_at_signup,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd:   sub.current_period_end,
    gracePeriodEnd:     sub.grace_period_end,
    autoRenew:          sub.auto_renew,
    createdAt:          sub.created_at,
  };
}

function serializeSubscriptionWithPlan(sub: SellerSubscription, plan: SellerPlan) {
  // Compute days-until-renewal server-side so the frontend never does date math.
  let daysUntilRenewal: number | null = null;
  if (sub.current_period_end) {
    const periodEnd  = new Date(sub.current_period_end + "T00:00:00Z");
    const todayUtc   = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    daysUntilRenewal = Math.ceil(
      (periodEnd.getTime() - todayUtc.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return {
    id:                 sub.id,
    status:             sub.status,
    plan: {
      id:                   plan.id,
      name:                 plan.name,
      slug:                 plan.slug,
      maxProducts:          plan.max_products,
      maxPhotosPerProduct:  plan.max_photos_per_product,
    },
    billingCycle:       sub.billing_cycle,
    priceAtSignup:      Number(sub.price_at_signup),
    currency:           sub.currency_at_signup,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd:   sub.current_period_end,
    gracePeriodEnd:     sub.grace_period_end,
    autoRenew:          sub.auto_renew,
    daysUntilRenewal,
    isExpiringSoon:     daysUntilRenewal !== null && daysUntilRenewal >= 0 && daysUntilRenewal <= 7,
    createdAt:          sub.created_at,
  };
}

function serializeInvoiceListItem(
  inv: SellerInvoice,
  latestPayment: { id: number; provider: string; status: string } | null,
) {
  return {
    id:             inv.id,
    invoiceNumber:  inv.invoice_number,
    type:           inv.type,
    status:         inv.status,
    totalAmount:    Number(inv.total_amount),
    currency:       inv.currency,
    dueDate:        inv.due_date,
    paidAt:         inv.paid_at,
    createdAt:      inv.created_at,
    latestPayment,
  };
}

function serializeInvoice(inv: SellerInvoice) {
  return {
    id:             inv.id,
    invoiceNumber:  inv.invoice_number,
    subscriptionId: inv.subscription_id,
    type:           inv.type,
    status:         inv.status,
    subtotalAmount: Number(inv.subtotal_amount),
    taxAmount:      Number(inv.tax_amount),
    totalAmount:    Number(inv.total_amount),
    currency:       inv.currency,
    dueDate:        inv.due_date,
    paidAt:         inv.paid_at,
    createdAt:      inv.created_at,
  };
}

function serializeInvoiceItem(item: SellerInvoiceItem) {
  return {
    id:          item.id,
    description: item.description,
    quantity:    item.quantity,
    unitAmount:  Number(item.unit_amount),
    totalAmount: Number(item.total_amount),
    periodStart: item.period_start,
    periodEnd:   item.period_end,
  };
}

function serializePaymentSummary(pmt: SellerBillingPayment) {
  return {
    id:           pmt.id,
    provider:     pmt.provider,
    status:       pmt.status,
    amount:       Number(pmt.amount),
    currency:     pmt.currency,
    confirmedAt:  pmt.confirmed_at,
    createdAt:    pmt.created_at,
  };
}

function serializePaymentListItem(
  pmt: SellerBillingPayment,
  invoiceNumber: string,
  reportStatus: string | null,
) {
  return {
    id:            pmt.id,
    invoiceId:     pmt.invoice_id,
    invoiceNumber,
    provider:      pmt.provider,
    status:        pmt.status,
    amount:        Number(pmt.amount),
    currency:      pmt.currency,
    confirmedAt:   pmt.confirmed_at,
    createdAt:     pmt.created_at,
    reportStatus,
  };
}

function serializePaymentDetail(pmt: SellerBillingPayment) {
  return {
    id:                   pmt.id,
    invoiceId:            pmt.invoice_id,
    provider:             pmt.provider,
    status:               pmt.status,
    amount:               Number(pmt.amount),
    currency:             pmt.currency,
    paymentLink:          pmt.provider_link,
    linkExpiresAt:        pmt.provider_link_expires_at,
    providerReference:    pmt.provider_reference,
    paymentMethodDetail:  pmt.payment_method_detail,
    confirmedAt:          pmt.confirmed_at,
    failureReason:        pmt.failure_reason,
    createdAt:            pmt.created_at,
  };
}

function serializePayment(pmt: SellerBillingPayment) {
  return {
    id:                   pmt.id,
    provider:             pmt.provider,
    status:               pmt.status,
    amount:               Number(pmt.amount),
    currency:             pmt.currency,
    providerReference:    pmt.provider_reference,
    paymentMethodDetail:  pmt.payment_method_detail,
    confirmedAt:          pmt.confirmed_at,
    createdAt:            pmt.created_at,
  };
}

function serializeReport(report: SellerManualPaymentReport) {
  return {
    id:               report.id,
    paymentId:        report.payment_id,
    invoiceId:        report.invoice_id,
    bankName:         report.bank_name,
    depositReference: report.deposit_reference,
    depositorName:    report.depositor_name,
    depositDate:      report.deposit_date,
    reportedAmount:   Number(report.reported_amount),
    currency:         report.currency,
    receiptFileUrl:   report.receipt_file_url,
    status:           report.status,
    rejectionReason:  report.rejection_reason,
    reviewedAt:       report.reviewed_at,
    createdAt:        report.created_at,
  };
}

// ─── Phase 5: Read handlers ───────────────────────────────────────────────────

/**
 * GET /api/seller/billing/subscriptions/current
 *
 * Returns the seller's current subscription enriched with plan details and
 * computed UX helpers (daysUntilRenewal, isExpiringSoon).
 * Returns { ok: true, subscription: null } when no active subscription exists.
 */
export async function getSellerCurrentSubscriptionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const result   = await getSellerCurrentSubscription(sellerId);

    if (!result) {
      res.status(200).json({ ok: true, subscription: null });
      return;
    }

    res.status(200).json({
      ok:           true,
      subscription: serializeSubscriptionWithPlan(result.subscription, result.plan),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * GET /api/seller/billing/invoices
 * Query: { status?, dateFrom?, dateTo?, limit?, offset? }
 *
 * Paginated invoice history. Each item includes a latestPayment preview so
 * the frontend can render payment status without a second request.
 */
export async function listSellerInvoicesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const query    = req.query as Record<string, string | undefined>;
    const { limit, offset } = parsePaginationQuery(query);

    const result = await listSellerInvoices({
      sellerId,
      status:   query.status   ?? null,
      dateFrom: query.dateFrom ?? null,
      dateTo:   query.dateTo   ?? null,
      limit,
      offset,
    });

    res.status(200).json({
      ok:      true,
      total:   result.total,
      limit,
      offset,
      invoices: result.rows.map(({ invoice, latestPayment }) =>
        serializeInvoiceListItem(invoice, latestPayment),
      ),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * GET /api/seller/billing/invoices/:invoiceId
 *
 * Full invoice detail: line items + all payment attempts ordered newest-first.
 * Returns 404 if the invoice doesn't exist or belongs to another seller.
 */
export async function getSellerInvoiceDetailHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId  = req.user!.id;
    const invoiceId = Number(req.params.invoiceId);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      res.status(400).json({ ok: false, code: "INVALID_INVOICE_ID", message: "invoiceId inválido" });
      return;
    }

    const detail = await getSellerInvoiceDetail(invoiceId, sellerId);

    if (!detail) {
      res.status(404).json({ ok: false, code: "INVOICE_NOT_FOUND", message: "Factura no encontrada" });
      return;
    }

    res.status(200).json({
      ok:       true,
      invoice:  serializeInvoice(detail.invoice),
      items:    detail.items.map(serializeInvoiceItem),
      payments: detail.payments.map(serializePaymentSummary),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * GET /api/seller/billing/payments
 * Query: { status?, invoiceId?, limit?, offset? }
 *
 * Paginated payment attempt history. Each row includes the invoice number
 * and manual report status to avoid secondary requests in the list view.
 */
export async function listSellerPaymentsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const query    = req.query as Record<string, string | undefined>;
    const { limit, offset } = parsePaginationQuery(query);

    const invoiceId = query.invoiceId ? Number(query.invoiceId) : null;

    const result = await listSellerPayments({
      sellerId,
      status:    query.status ?? null,
      invoiceId: invoiceId && Number.isInteger(invoiceId) && invoiceId > 0 ? invoiceId : null,
      limit,
      offset,
    });

    res.status(200).json({
      ok:       true,
      total:    result.total,
      limit,
      offset,
      payments: result.rows.map(({ payment, invoiceNumber, reportStatus }) =>
        serializePaymentListItem(payment, invoiceNumber, reportStatus),
      ),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * GET /api/seller/billing/payments/:paymentId
 *
 * Full payment detail: includes provider_link, failure_reason, and the linked
 * manual payment report (if any). Returns 404 if not owned by this seller.
 */
export async function getSellerPaymentDetailHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId  = req.user!.id;
    const paymentId = Number(req.params.paymentId);

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      res.status(400).json({ ok: false, code: "INVALID_PAYMENT_ID", message: "paymentId inválido" });
      return;
    }

    const detail = await getSellerPaymentDetail(paymentId, sellerId);

    if (!detail) {
      res.status(404).json({ ok: false, code: "PAYMENT_NOT_FOUND", message: "Pago no encontrado" });
      return;
    }

    res.status(200).json({
      ok:           true,
      payment:      serializePaymentDetail(detail.payment),
      invoice:      serializeInvoice(detail.invoice),
      manualReport: detail.report ? serializeReport(detail.report) : null,
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

// ─── Existing write handlers ──────────────────────────────────────────────────

/**
 * POST /api/seller/billing/subscriptions
 * Body: { planId, billingCycle, autoRenew? }
 *
 * Creates a draft subscription + open invoice for the authenticated seller.
 * Does NOT generate a payment link — seller calls /payment-links next.
 */
export async function createSellerSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const { planId, billingCycle, autoRenew, notes } = req.body as {
      planId:        unknown;
      billingCycle:  unknown;
      autoRenew?:    unknown;
      notes?:        unknown;
    };

    const result = await createSubscription({
      sellerId,
      planId:       Number(planId),
      billingCycle: billingCycle as BillingCycle,
      autoRenew:    autoRenew === undefined ? undefined : Boolean(autoRenew),
      notes:        typeof notes === "string" ? notes : null,
      actorUserId:  sellerId,
      actorRole:    "seller",
    });

    res.status(result.reusedSubscription && result.reusedInvoice ? 200 : 201).json({
      ok:                 true,
      reusedSubscription: result.reusedSubscription,
      reusedInvoice:      result.reusedInvoice,
      subscription:       serializeSubscription(result.subscription),
      invoice:            serializeInvoice(result.invoice),
      invoiceItems:       result.invoiceItems.map(serializeInvoiceItem),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * POST /api/seller/billing/invoices/:subscriptionId/renewal
 * Body: { notes? }
 *
 * Generates a renewal invoice for an active/past_due subscription.
 */
export async function generateSellerInvoice(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId       = req.user!.id;
    const subscriptionId = Number(req.params.subscriptionId);
    const { notes }      = req.body as { notes?: unknown };

    const result = await generateInvoice({
      sellerId,
      subscriptionId,
      reason: "renewal",
      notes:  typeof notes === "string" ? notes : null,
      actorUserId: sellerId,
      actorRole:   "seller",
    });

    res.status(result.reused ? 200 : 201).json({
      ok:           true,
      reused:       result.reused,
      invoice:      serializeInvoice(result.invoice),
      invoiceItems: result.items.map(serializeInvoiceItem),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * POST /api/seller/billing/payment-links
 * Body: { invoiceId, provider }
 *
 * Generates (or reuses) a payment link for an open invoice.
 * Use provider="manual" to get bank transfer instructions without a link.
 */
export async function generateSellerPaymentLink(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const { invoiceId, provider, notes } = req.body as {
      invoiceId: unknown;
      provider:  unknown;
      notes?:    unknown;
    };

    const result = await generatePaymentLink({
      invoiceId: Number(invoiceId),
      provider:  provider as BillingProvider,
      notes:     typeof notes === "string" ? notes : null,
      actorUserId: sellerId,
      actorRole:   "seller",
    });

    res.status(result.reused ? 200 : 201).json({
      ok:                  true,
      reused:              result.reused,
      paymentId:           result.payment.id,
      paymentStatus:       result.payment.status,
      provider:            result.payment.provider,
      paymentLink:         result.paymentLink,
      linkExpiresAt:       result.linkExpiresAt,
      providerReference:   result.providerReference,
      paymentMethodDetail: result.paymentMethodDetail,
      instructions:        result.instructions,
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * POST /api/seller/billing/manual-payment-reports
 * Body: { paymentId, bankName, depositReference, depositorName,
 *         depositDate, reportedAmount, currency, receiptFileUrl?, notes? }
 *
 * Seller reports a manual bank deposit for a pending payment attempt.
 */
export async function reportSellerManualPayment(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const {
      paymentId,
      bankName,
      depositReference,
      depositorName,
      depositDate,
      reportedAmount,
      currency,
      receiptFileUrl,
      notes,
    } = req.body as Record<string, unknown>;

    const result = await reportManualPayment({
      sellerId,
      paymentId:        Number(paymentId),
      bankName:         String(bankName ?? ""),
      depositReference: String(depositReference ?? ""),
      depositorName:    String(depositorName ?? ""),
      depositDate:      String(depositDate ?? ""),
      reportedAmount:   Number(reportedAmount),
      currency:         String(currency ?? ""),
      receiptFileUrl:   typeof receiptFileUrl === "string" ? receiptFileUrl : null,
      notes:            typeof notes === "string" ? notes : null,
      actorUserId:      sellerId,
      actorRole:        "seller",
    });

    res.status(201).json({
      ok:            true,
      report:        serializeReport(result.report),
      paymentStatus: result.payment.status,
      invoiceStatus: result.invoice.status,
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * GET /api/seller/billing/manual-payment-reports
 * Query: { status?, limit?, offset? }
 *
 * Lists the authenticated seller's own manual payment reports.
 */
export async function listSellerManualPaymentReports(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const { status, limit, offset } = req.query as Record<string, string | undefined>;

    const result = await listManualPaymentReports({
      sellerId,
      status:  status as any ?? null,
      limit:   limit  ? Number(limit)  : 20,
      offset:  offset ? Number(offset) : 0,
    });

    res.status(200).json({
      ok:      true,
      total:   result.total,
      reports: result.reports.map(serializeReport),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * GET /api/seller/billing/manual-payment-reports/:reportId
 *
 * Returns the detail of a single manual payment report owned by the seller.
 * Includes linked payment, invoice, and invoice items.
 */
export async function getSellerManualPaymentReportDetail(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const reportId = Number(req.params.reportId);

    const detail = await getManualPaymentReportDetail({ reportId, sellerId });

    res.status(200).json({
      ok:           true,
      report:       serializeReport(detail.report),
      payment:      serializePayment(detail.payment),
      invoice:      serializeInvoice(detail.invoice),
      invoiceItems: detail.invoiceItems.map(serializeInvoiceItem),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}
