// src/routes/payment.routes.ts
//
// IMPORTANT: The webhook route uses express.raw() to preserve the raw body
// for HMAC signature verification. It must NOT pass through express.json()
// before reaching the handler, or the signature check will fail.

import { Router } from "express";
import express    from "express";
import rateLimit  from "express-rate-limit";
import asyncHandler    from "../middleware/asyncHandler";
import { verifyToken } from "../middleware/auth";
import {
  createPaymentAttempt,
  handleWebhook,
} from "../controllers/payment.controller";

const router: ReturnType<typeof Router> = Router();

// Stricter rate limit for payment attempt creation
const attemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, code: "RATE_LIMITED", message: "Demasiados intentos de pago. Espera un momento." },
});

// POST /api/payments/attempts — authenticated buyer, rate-limited
router.post(
  "/attempts",
  verifyToken(["buyer"]),
  attemptLimiter,
  asyncHandler(createPaymentAttempt),
);

// POST /api/payments/webhooks/:provider
// Public endpoint — no auth. Raw body REQUIRED for HMAC signature verification.
// express.raw() is scoped only to this route so it does not affect other routes.
router.post(
  "/webhooks/:provider",
  express.raw({ type: "*/*", limit: "1mb" }),
  asyncHandler(handleWebhook),
);

export default router;
