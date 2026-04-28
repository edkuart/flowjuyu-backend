// Public Stripe webhook endpoints — no authentication.
// express.raw() is applied in app.ts BEFORE express.json() for these paths.
import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { handleVideoCreditWebhook } from "../controllers/videoCreditCheckout.controller";
import { handleAiCreditWebhook } from "../controllers/sellerAiCredits.controller";

const router: ReturnType<typeof Router> = Router();

// POST /api/webhooks/stripe/video-credits
router.post("/video-credits", asyncHandler(handleVideoCreditWebhook));

// POST /api/webhooks/stripe/ai-credits
router.post("/ai-credits", asyncHandler(handleAiCreditWebhook));

export default router;
