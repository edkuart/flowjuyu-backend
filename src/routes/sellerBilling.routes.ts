// src/routes/sellerBilling.routes.ts
//
// Mounted at: /api/seller/billing
// All routes require role=seller.
//
// Route ordering rules:
//   • GET /subscriptions/current  MUST come before any future GET /subscriptions/:id
//   • GET /invoices/:invoiceId    MUST come after  GET /invoices  (Express matches top-down)
//   • GET /payments/:paymentId    MUST come after  GET /payments

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import asyncHandler from "../middleware/asyncHandler";
import {
  // Phase 5: read
  getSellerCurrentSubscriptionHandler,
  listSellerInvoicesHandler,
  getSellerInvoiceDetailHandler,
  listSellerPaymentsHandler,
  getSellerPaymentDetailHandler,
  // Write
  createSellerSubscription,
  generateSellerInvoice,
  generateSellerPaymentLink,
  reportSellerManualPayment,
  listSellerManualPaymentReports,
  getSellerManualPaymentReportDetail,
} from "../controllers/sellerBilling.controller";

const router = Router();

// ─── Subscriptions ────────────────────────────────────────────────────────────

// GET  /api/seller/billing/subscriptions/current  → current sub + plan + UX helpers
// NOTE: registered before any /:id variant to prevent "current" being treated as an id.
router.get(
  "/subscriptions/current",
  verifyToken(["seller"]),
  asyncHandler(getSellerCurrentSubscriptionHandler),
);

// POST /api/seller/billing/subscriptions          → create draft + invoice
router.post(
  "/subscriptions",
  verifyToken(["seller"]),
  asyncHandler(createSellerSubscription),
);

// ─── Invoices ─────────────────────────────────────────────────────────────────

// GET  /api/seller/billing/invoices                → paginated invoice history
router.get(
  "/invoices",
  verifyToken(["seller"]),
  asyncHandler(listSellerInvoicesHandler),
);

// GET  /api/seller/billing/invoices/:invoiceId     → invoice detail + items + payments
router.get(
  "/invoices/:invoiceId",
  verifyToken(["seller"]),
  asyncHandler(getSellerInvoiceDetailHandler),
);

// POST /api/seller/billing/invoices/:subscriptionId/renewal
router.post(
  "/invoices/:subscriptionId/renewal",
  verifyToken(["seller"]),
  asyncHandler(generateSellerInvoice),
);

// ─── Payments ─────────────────────────────────────────────────────────────────

// GET  /api/seller/billing/payments                → paginated payment history
router.get(
  "/payments",
  verifyToken(["seller"]),
  asyncHandler(listSellerPaymentsHandler),
);

// GET  /api/seller/billing/payments/:paymentId     → payment detail + invoice + manual report
router.get(
  "/payments/:paymentId",
  verifyToken(["seller"]),
  asyncHandler(getSellerPaymentDetailHandler),
);

// POST /api/seller/billing/payment-links           → generate/reuse payment link
router.post(
  "/payment-links",
  verifyToken(["seller"]),
  asyncHandler(generateSellerPaymentLink),
);

// ─── Manual payment reports ───────────────────────────────────────────────────

// POST /api/seller/billing/manual-payment-reports        → report deposit
router.post(
  "/manual-payment-reports",
  verifyToken(["seller"]),
  asyncHandler(reportSellerManualPayment),
);

// GET  /api/seller/billing/manual-payment-reports        → list own reports
router.get(
  "/manual-payment-reports",
  verifyToken(["seller"]),
  asyncHandler(listSellerManualPaymentReports),
);

// GET  /api/seller/billing/manual-payment-reports/:reportId  → detail
// NOTE: must come after the bare /manual-payment-reports route.
router.get(
  "/manual-payment-reports/:reportId",
  verifyToken(["seller"]),
  asyncHandler(getSellerManualPaymentReportDetail),
);

export default router;
