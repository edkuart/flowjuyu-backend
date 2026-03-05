import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  getTopViewedProducts,
  trackProductView,
  trackSellerView,
  getSellerAnalyticsOverview,
} from "../controllers/analytics.controller";

import { requireRole } from "../middleware/auth";

const router = Router();

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
  "/track/product/:productId",
  trackingLimiter,
  trackProductView
);

router.post(
  "/track/seller/:sellerId",
  trackingLimiter,
  trackSellerView
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

export default router;
