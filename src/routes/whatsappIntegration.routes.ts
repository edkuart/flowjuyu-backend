import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import {
  receiveWhatsappWebhook,
  verifyWhatsappWebhook,
} from "../controllers/whatsappIntegration.controller";

const router: ReturnType<typeof Router> = Router();

router.get("/webhook", asyncHandler(verifyWhatsappWebhook));
router.post("/webhook", asyncHandler(receiveWhatsappWebhook));

export default router;
