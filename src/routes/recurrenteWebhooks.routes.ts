// Public Recurrente webhook endpoints — no authentication.
// express.raw() is applied in app.ts BEFORE express.json() for these paths.
import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { handleAiCreditRecurrenteWebhookRequest } from "../controllers/sellerAiCredits.controller";

const router: ReturnType<typeof Router> = Router();

// POST /api/webhooks/recurrente/ai-credits
router.post(
  "/ai-credits",
  asyncHandler(handleAiCreditRecurrenteWebhookRequest),
);

export default router;
