// src/routes/consent.routes.ts
//
// Mounted at /api/consent in app.ts
//
// All routes require authentication (requireAuth is applied at the router level).
// No role restriction — buyers, sellers, and admins all need to manage consent.

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import asyncHandler from "../middleware/asyncHandler";
import {
  getConsentStatus,
  acceptConsent,
  getConsentPreferences,
  updateConsentPreferences,
  getMarketingPrompt,
  updateMarketingPrompt,
  acceptMarketingPromptFromNudge,
} from "../controllers/consent.controller";

const router: Router = Router();

router.use(requireAuth);

router.get("/status", asyncHandler(getConsentStatus));
router.get("/preferences", asyncHandler(getConsentPreferences));
router.put("/preferences", asyncHandler(updateConsentPreferences));
router.get("/prompts/:promptKey", asyncHandler(getMarketingPrompt));
router.put("/prompts/:promptKey", asyncHandler(updateMarketingPrompt));
router.post("/prompts/:promptKey/accept", asyncHandler(acceptMarketingPromptFromNudge));
router.post("/accept", asyncHandler(acceptConsent));

export default router;
