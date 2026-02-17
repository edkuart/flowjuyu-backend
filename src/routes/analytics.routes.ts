import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getTopViewedProducts,
  trackProductView,
  trackSellerView,
} from "../controllers/analytics.controller";

const router = Router();

/* ============================================
   Rate limit específico para tracking
   (más estricto que el global si quieres)
============================================ */
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // máximo 120 requests por minuto por IP
  standardHeaders: true,
  legacyHeaders: false,
});

/* ============================================
   Admin
============================================ */
router.get("/top-products", getTopViewedProducts);

/* ============================================
   Tracking público
============================================ */
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

export default router;
