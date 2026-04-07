// src/routes/adminBilling.routes.ts
//
// Mounted at: /api/admin/billing
// All routes require role=admin.

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import asyncHandler from "../middleware/asyncHandler";
import {
  adminListManualPaymentReports,
  adminGetManualPaymentReportDetail,
  adminMarkManualPaymentUnderReview,
  adminApproveManualPayment,
  adminRejectManualPayment,
} from "../controllers/adminBilling.controller";

const router = Router();

// ─── Manual payment reports queue ─────────────────────────────────────────────

// GET    /api/admin/billing/manual-payment-reports
//        List all reports (filterable by status, sellerId, invoiceId, date range)
router.get(
  "/manual-payment-reports",
  verifyToken(["admin"]),
  asyncHandler(adminListManualPaymentReports),
);

// GET    /api/admin/billing/manual-payment-reports/:reportId
//        Full detail: report + payment + invoice + invoice items
router.get(
  "/manual-payment-reports/:reportId",
  verifyToken(["admin"]),
  asyncHandler(adminGetManualPaymentReportDetail),
);

// PATCH  /api/admin/billing/manual-payment-reports/:reportId/under-review
//        submitted → under_review  (idempotent)
router.patch(
  "/manual-payment-reports/:reportId/under-review",
  verifyToken(["admin"]),
  asyncHandler(adminMarkManualPaymentUnderReview),
);

// POST   /api/admin/billing/manual-payment-reports/:reportId/approve
//        submitted|under_review → approved  (idempotent)
//        Atomically confirms payment, marks invoice paid, activates subscription.
router.post(
  "/manual-payment-reports/:reportId/approve",
  verifyToken(["admin"]),
  asyncHandler(adminApproveManualPayment),
);

// POST   /api/admin/billing/manual-payment-reports/:reportId/reject
//        submitted|under_review → rejected  (idempotent)
//        Marks payment failed; invoice stays open for retry.
router.post(
  "/manual-payment-reports/:reportId/reject",
  verifyToken(["admin"]),
  asyncHandler(adminRejectManualPayment),
);

export default router;
