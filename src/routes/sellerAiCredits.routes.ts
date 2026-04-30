// src/routes/sellerAiCredits.routes.ts
//
// Mounted at: /api/seller/ai-credits
// All routes require role=seller.

import { Router, type IRouter } from "express";
import { verifyToken } from "../middleware/auth";
import asyncHandler from "../middleware/asyncHandler";
import {
  getSellerAiCreditsBalance,
  getAiCreditPackages,
  getSellerAiCreditTransactions,
  createAiCreditCheckout,
  captureAiCreditCheckout,
  cancelAiCreditCheckout,
  aiCreditCheckoutRateLimiter,
  getAiCreditPaymentOptions,
  requestAiCreditPurchase,
  listSellerAiCreditPurchaseRequests,
} from "../controllers/sellerAiCredits.controller";

const router: IRouter = Router();

// GET  /api/seller/ai-credits/balance          → current balance
router.get(
  "/balance",
  verifyToken(["seller"]),
  asyncHandler(getSellerAiCreditsBalance),
);

// GET  /api/seller/ai-credits/packages         → purchasable packages catalog
router.get(
  "/packages",
  verifyToken(["seller"]),
  asyncHandler(getAiCreditPackages),
);

// GET  /api/seller/ai-credits/transactions     → ledger history
router.get(
  "/transactions",
  verifyToken(["seller"]),
  asyncHandler(getSellerAiCreditTransactions),
);

// GET  /api/seller/ai-credits/payment-options -> configured payment providers
router.get(
  "/payment-options",
  verifyToken(["seller"]),
  asyncHandler(getAiCreditPaymentOptions),
);

// POST /api/seller/ai-credits/checkout       -> hosted checkout for AI credits
router.post(
  "/checkout",
  verifyToken(["seller"]),
  aiCreditCheckoutRateLimiter,
  asyncHandler(createAiCreditCheckout),
);

// POST /api/seller/ai-credits/capture        -> capture PayPal checkout
router.post(
  "/capture",
  verifyToken(["seller"]),
  aiCreditCheckoutRateLimiter,
  asyncHandler(captureAiCreditCheckout),
);

// POST /api/seller/ai-credits/cancel         -> mark unpaid checkout as rejected
router.post(
  "/cancel",
  verifyToken(["seller"]),
  aiCreditCheckoutRateLimiter,
  asyncHandler(cancelAiCreditCheckout),
);

// GET  /api/seller/ai-credits/purchase-requests → own request history
router.get(
  "/purchase-requests",
  verifyToken(["seller"]),
  asyncHandler(listSellerAiCreditPurchaseRequests),
);

// POST /api/seller/ai-credits/purchase-requests → submit a purchase request
router.post(
  "/purchase-requests",
  verifyToken(["seller"]),
  asyncHandler(requestAiCreditPurchase),
);

export default router;
