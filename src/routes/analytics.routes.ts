import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  getTopViewedProducts,
  trackProductView,
  trackSellerView,
  trackAnalyticsEvent,
  trackWhatsappClick,
  getLiveViewerCount,
  getSellerAnalyticsOverview,
  getSellerLiveMetrics,
} from "../controllers/analytics.controller";

import { requireRole } from "../middleware/auth";

const router: ReturnType<typeof Router> = Router();

/* =====================================================
   🔒 Rate limit específico para tracking público
===================================================== */
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/* =====================================================
   📊 Público / Admin
===================================================== */

// Top productos más vistos (público)
router.get("/top-products", getTopViewedProducts);

/* =====================================================
   👁 Tracking público
===================================================== */

router.post(
  "/",
  trackingLimiter,
  trackAnalyticsEvent
);

router.post(
  "/track/product/:productId",
  trackingLimiter,
  trackProductView
);

router.post(
  "/track/seller/:sellerId",
  trackingLimiter,
  trackSellerView
);

// WhatsApp click tracking (rate-limited, public)
router.post(
  "/whatsapp-click",
  trackingLimiter,
  trackWhatsappClick
);

router.get(
  "/live-viewers/:sellerId",
  trackingLimiter,
  getLiveViewerCount
);

/* =====================================================
   🏪 Analytics privadas del seller
   (requiere rol seller)
===================================================== */

router.get(
  "/seller/analytics",
  requireRole("seller"),
  getSellerAnalyticsOverview
);

router.get(
  "/seller/live-metrics",
  requireRole("seller"),
  getSellerLiveMetrics
);

export default router;
