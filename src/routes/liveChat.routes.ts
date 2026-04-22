import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  createLiveChatMessage,
  createSellerLiveChatMessage,
  getSellerLiveChatSettingsHandler,
  listLiveChatMessages,
  listSellerLiveChatMessages,
  streamLiveChatMessages,
  updateSellerLiveChatSettingsHandler,
  updateSellerLiveChatMessageStatus,
} from "../controllers/liveChat.controller";
import { requireRole } from "../middleware/auth";

const router: ReturnType<typeof Router> = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get(
  "/public/live-chat/:sellerId/messages",
  publicLimiter,
  listLiveChatMessages,
);

router.get(
  "/public/live-chat/:sellerId/stream",
  publicLimiter,
  streamLiveChatMessages,
);

router.post(
  "/live-chat/messages",
  writeLimiter,
  requireRole("buyer"),
  createLiveChatMessage,
);

router.get(
  "/seller/live-chat/messages",
  requireRole("seller"),
  listSellerLiveChatMessages,
);

router.patch(
  "/seller/live-chat/messages/:messageId",
  requireRole("seller"),
  updateSellerLiveChatMessageStatus,
);

router.get(
  "/seller/live-chat/settings",
  requireRole("seller"),
  getSellerLiveChatSettingsHandler,
);

router.patch(
  "/seller/live-chat/settings",
  requireRole("seller"),
  updateSellerLiveChatSettingsHandler,
);

router.post(
  "/seller/live-chat/messages",
  writeLimiter,
  requireRole("seller"),
  createSellerLiveChatMessage,
);

export default router;
