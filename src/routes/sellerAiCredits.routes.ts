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
  aiCreditCheckoutRateLimiter,
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

// POST /api/seller/ai-credits/checkout       -> hosted checkout for AI credits
router.post(
  "/checkout",
  verifyToken(["seller"]),
  aiCreditCheckoutRateLimiter,
  asyncHandler(createAiCreditCheckout),
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
