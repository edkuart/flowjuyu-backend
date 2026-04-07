// src/controllers/adminBilling.controller.ts
//
// Admin-facing billing endpoints for manual payment review.
// All handlers require admin role (enforced at the route middleware level).
// The adminId is always taken from req.user!.id — never from the request body.

import type { Request, Response } from "express";
import {
  approveManualPayment,
  getManualPaymentReportDetail,
  listManualPaymentReports,
  markManualPaymentUnderReview,
  rejectManualPayment,
} from "../services/billing.service";
import { BillingDomainError, BillingValidationError } from "../services/billing.types";
import type { ManualPaymentReportStatus } from "../models/SellerManualPaymentReport.model";

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
  throw err;
}

const DOMAIN_ERROR_STATUS: Record<string, number> = {
  REPORT_NOT_FOUND:           404,
  PAYMENT_NOT_FOUND:          404,
  INVOICE_NOT_FOUND:          404,
  REPORT_ALREADY_APPROVED:    409,
  REPORT_ALREADY_REJECTED:    409,
  REPORT_NOT_APPROVABLE:      409,
  REPORT_NOT_REJECTABLE:      409,
  REPORT_INVALID_STATE_TRANSITION: 409,
  PAYMENT_ALREADY_CONFIRMED:  409,
  PAYMENT_NOT_MANUAL_PENDING: 409,
  INVOICE_ALREADY_PAID:       409,
  INVOICE_NOT_OPEN:           409,
  REPORT_PAYMENT_MISMATCH:    422,
  REPORT_INVOICE_MISMATCH:    422,
  PAYMENT_INVOICE_MISMATCH:   422,
  REPORT_SELLER_MISMATCH:     422,
  PAYMENT_PROVIDER_NOT_MANUAL: 422,
  INVOICE_HAS_NO_SUBSCRIPTION: 422,
  MISSING_REJECTION_REASON:   400,
};

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/billing/manual-payment-reports
 * Query: { status?, sellerId?, invoiceId?, dateFrom?, dateTo?, limit?, offset? }
 *
 * Lists manual payment reports across all sellers.
 * Supports full filtering for the admin review queue.
 */
export async function adminListManualPaymentReports(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const {
      status,
      sellerId,
      invoiceId,
      dateFrom,
      dateTo,
      limit,
      offset,
    } = req.query as Record<string, string | undefined>;

    const result = await listManualPaymentReports({
      status:    (status as ManualPaymentReportStatus) ?? null,
      sellerId:  sellerId  ? Number(sellerId)  : null,
      invoiceId: invoiceId ? Number(invoiceId) : null,
      dateFrom:  dateFrom ?? null,
      dateTo:    dateTo   ?? null,
      limit:     limit    ? Number(limit)  : 20,
      offset:    offset   ? Number(offset) : 0,
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
 * GET /api/admin/billing/manual-payment-reports/:reportId
 *
 * Returns full detail for one manual payment report.
 * Includes linked payment, invoice, and invoice items.
 */
export async function adminGetManualPaymentReportDetail(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const reportId = Number(req.params.reportId);

    // No sellerId filter — admin can view all reports.
    const detail = await getManualPaymentReportDetail({ reportId });

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

/**
 * PATCH /api/admin/billing/manual-payment-reports/:reportId/under-review
 * Body: { notes? }
 *
 * Transitions report from submitted → under_review.
 * Records the admin reviewer. Idempotent.
 */
export async function adminMarkManualPaymentUnderReview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const adminId  = req.user!.id;
    const reportId = Number(req.params.reportId);
    const { notes } = req.body as { notes?: unknown };

    const result = await markManualPaymentUnderReview({
      reportId,
      adminId,
      notes:       typeof notes === "string" ? notes : null,
      actorUserId: adminId,
      actorRole:   "admin",
    });

    res.status(200).json({
      ok:               true,
      alreadyUnderReview: result.alreadyUnderReview,
      report:           serializeReport(result.report),
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * POST /api/admin/billing/manual-payment-reports/:reportId/approve
 * Body: { notes? }
 *
 * Approves a manual payment report.
 * Atomically: marks report approved + confirms payment + marks invoice paid
 * + activates seller subscription. Idempotent.
 */
export async function adminApproveManualPayment(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const adminId  = req.user!.id;
    const reportId = Number(req.params.reportId);
    const { notes } = req.body as { notes?: unknown };

    const result = await approveManualPayment({
      reportId,
      adminId,
      notes:       typeof notes === "string" ? notes : null,
      actorUserId: adminId,
      actorRole:   "admin",
    });

    res.status(200).json({
      ok:             true,
      alreadyApproved: result.alreadyApproved,
      report:         serializeReport(result.report),
      payment:        serializePayment(result.payment),
      invoice:        serializeInvoice(result.invoice),
      subscription: {
        id:                 result.subscription.id,
        status:             result.subscription.status,
        currentPeriodStart: result.periodStart,
        currentPeriodEnd:   result.periodEnd,
      },
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

/**
 * POST /api/admin/billing/manual-payment-reports/:reportId/reject
 * Body: { rejectionReason, notes? }
 *
 * Rejects a manual payment report.
 * Atomically: marks report rejected + marks payment failed.
 * Invoice intentionally stays open so seller can retry with a new attempt.
 * Idempotent.
 */
export async function adminRejectManualPayment(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const adminId  = req.user!.id;
    const reportId = Number(req.params.reportId);
    const { rejectionReason, notes } = req.body as {
      rejectionReason?: unknown;
      notes?: unknown;
    };

    const result = await rejectManualPayment({
      reportId,
      adminId,
      rejectionReason: typeof rejectionReason === "string" ? rejectionReason : "",
      notes:           typeof notes === "string" ? notes : null,
      actorUserId:     adminId,
      actorRole:       "admin",
    });

    res.status(200).json({
      ok:              true,
      alreadyRejected: result.alreadyRejected,
      report:          serializeReport(result.report),
      payment: {
        id:            result.payment.id,
        status:        result.payment.status,
        failureReason: result.payment.failure_reason,
      },
      invoice: {
        id:     result.invoice.id,
        status: result.invoice.status,
      },
    });
  } catch (err) {
    handleBillingError(err, res);
  }
}

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializeReport(report: any) {
  return {
    id:               report.id,
    paymentId:        report.payment_id,
    sellerId:         report.seller_id,
    invoiceId:        report.invoice_id,
    bankName:         report.bank_name,
    depositReference: report.deposit_reference,
    depositorName:    report.depositor_name,
    depositDate:      report.deposit_date,
    reportedAmount:   Number(report.reported_amount),
    currency:         report.currency,
    receiptFileUrl:   report.receipt_file_url,
    notes:            report.notes,
    status:           report.status,
    reviewedBy:       report.reviewed_by,
    reviewedAt:       report.reviewed_at,
    rejectionReason:  report.rejection_reason,
    createdAt:        report.created_at,
    updatedAt:        report.updated_at,
  };
}

function serializePayment(pmt: any) {
  return {
    id:                  pmt.id,
    sellerId:            pmt.seller_id,
    invoiceId:           pmt.invoice_id,
    provider:            pmt.provider,
    status:              pmt.status,
    amount:              Number(pmt.amount),
    currency:            pmt.currency,
    providerReference:   pmt.provider_reference,
    paymentMethodDetail: pmt.payment_method_detail,
    failureReason:       pmt.failure_reason,
    confirmedAt:         pmt.confirmed_at,
    confirmedBy:         pmt.confirmed_by,
    notes:               pmt.notes,
    createdAt:           pmt.created_at,
  };
}

function serializeInvoice(inv: any) {
  return {
    id:             inv.id,
    sellerId:       inv.seller_id,
    subscriptionId: inv.subscription_id,
    invoiceNumber:  inv.invoice_number,
    type:           inv.type,
    status:         inv.status,
    subtotalAmount: Number(inv.subtotal_amount),
    taxAmount:      Number(inv.tax_amount),
    totalAmount:    Number(inv.total_amount),
    currency:       inv.currency,
    dueDate:        inv.due_date,
    paidAt:         inv.paid_at,
    notes:          inv.notes,
    createdAt:      inv.created_at,
  };
}

function serializeInvoiceItem(item: any) {
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
