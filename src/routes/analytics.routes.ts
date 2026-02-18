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
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // 120 requests por IP por minuto
  standardHeaders: true,
  legacyHeaders: false,
});

/* =====================================================
   📊 Público / Admin
===================================================== */

// Top productos más vistos (puede ser público)
router.get("/top-products", getTopViewedProducts);

/* =====================================================
   👁 Tracking público
   (no requiere autenticación)
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
   🏪 Analytics privadas del vendedor
   (requiere rol vendedor)
===================================================== */

// 🔥 ESTA es la ruta correcta que tu frontend ya usa
router.get(
  "/seller/analytics",
  requireRole("vendedor"),
  getSellerAnalyticsOverview
);

export default router;
