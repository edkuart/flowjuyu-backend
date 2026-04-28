import { Router } from "express";
import multer from "multer";
import asyncHandler from "../middleware/asyncHandler";
import { requireRole } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
import * as VS from "../controllers/videoStudio.controller";
import {
  createCreditCheckout,
  captureCreditPaymentHandler,
  checkoutRateLimiter,
} from "../controllers/videoCreditCheckout.controller";

const router: ReturnType<typeof Router> = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
});

// All routes require authenticated active seller
// requireRole already calls verifyToken internally — no double check needed
router.use(requireRole("seller") as any, requireActiveSeller as any);

// Provider config (qué modelos están disponibles y sus costos)
router.get("/video-provider-models", asyncHandler(VS.getProviderModels));

// Templates
router.get("/video-templates", asyncHandler(VS.getTemplates));

// Projects
router.get("/video-projects", asyncHandler(VS.listProjects));
router.post("/video-projects", asyncHandler(VS.createProject));
router.get("/video-projects/:id", asyncHandler(VS.getProject));
router.patch("/video-projects/:id", asyncHandler(VS.updateProject));
router.delete("/video-projects/:id", asyncHandler(VS.deleteProject));

// Assets
router.post("/video-assets/upload", upload.array("images", 6), asyncHandler(VS.uploadAssetImages));
router.put("/video-projects/:id/assets", asyncHandler(VS.upsertAssets));

// Generations
router.post("/video-projects/:id/generations", asyncHandler(VS.createGeneration));
router.get("/video-generations/:generationId", asyncHandler(VS.getGeneration));
router.get("/video-generations/:generationId/download", asyncHandler(VS.downloadGeneration));
router.post("/video-generations/:generationId/cancel", asyncHandler(VS.cancelGeneration));
router.delete("/video-generations/:generationId", asyncHandler(VS.deleteGeneration));

// Credits balance
router.get("/video-credits", asyncHandler(VS.getCredits));

// Credit purchase — PayPal Orders API v2
// Step 1: create PayPal order → return approve URL
router.post(
  "/video-credits/checkout",
  checkoutRateLimiter,
  asyncHandler(createCreditCheckout),
);
// Step 2: capture after PayPal redirects back
router.post(
  "/video-credits/capture",
  asyncHandler(captureCreditPaymentHandler),
);

export default router;
