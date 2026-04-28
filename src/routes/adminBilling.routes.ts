// src/routes/adminBilling.routes.ts
//
// Mounted at: /api/admin/billing
// All routes require role=admin.

import { Router, type IRouter } from "express";
import { verifyToken } from "../middleware/auth";
import asyncHandler from "../middleware/asyncHandler";
import {
  adminListManualPaymentReports,
  adminGetManualPaymentReportDetail,
  adminMarkManualPaymentUnderReview,
  adminApproveManualPayment,
  adminRejectManualPayment,
} from "../controllers/adminBilling.controller";
import { adminAddCredits } from "../controllers/videoStudio.controller";
import {
  adminListAiCreditPurchaseRequests,
  adminApproveAiCreditRequest,
  adminRejectAiCreditRequest,
  adminGrantAiCredits,
} from "../controllers/sellerAiCredits.controller";

const router: IRouter = Router();

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

// POST   /api/admin/billing/video-credits/:sellerId
//        Add GTQ centavos to a seller's video credit wallet (manual top-up)
router.post(
  "/video-credits/:sellerId",
  verifyToken(["admin"]),
  asyncHandler(adminAddCredits),
);

// ─── AI Credits admin queue ────────────────────────────────────────────────────

// GET    /api/admin/billing/ai-credits/purchase-requests
//        List all pending/under_review AI credit purchase requests
router.get(
  "/ai-credits/purchase-requests",
  verifyToken(["admin"]),
  asyncHandler(adminListAiCreditPurchaseRequests),
);

// POST   /api/admin/billing/ai-credits/purchase-requests/:requestId/approve
//        Approve → credits added to seller wallet atomically
router.post(
  "/ai-credits/purchase-requests/:requestId/approve",
  verifyToken(["admin"]),
  asyncHandler(adminApproveAiCreditRequest),
);

// POST   /api/admin/billing/ai-credits/purchase-requests/:requestId/reject
//        Reject → seller notified, no credits added
router.post(
  "/ai-credits/purchase-requests/:requestId/reject",
  verifyToken(["admin"]),
  asyncHandler(adminRejectAiCreditRequest),
);

// POST   /api/admin/billing/ai-credits/grant/:sellerId
//        Manually grant AI credits to a seller (promotions, support, etc.)
router.post(
  "/ai-credits/grant/:sellerId",
  verifyToken(["admin"]),
  asyncHandler(adminGrantAiCredits),
);

export default router;
