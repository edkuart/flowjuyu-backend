// src/routes/seller.routes.ts

import { Router } from "express";
import multer from "multer";
import asyncHandler from "../middleware/asyncHandler";
import { verifyToken, requireRole, requireAuth } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
import * as SellerController from "../controllers/seller.controller";
import * as SellerTicketController from "../controllers/sellerTicket.controller";

const router: ReturnType<typeof Router> = Router();

/* ==================================================
   📦 Configuración Multer
================================================== */

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|avif)$/.test(file.mimetype)) {
      return cb(
        new Error("Solo se permiten imágenes (png, jpg, webp, avif)")
      );
    }
    cb(null, true);
  },
});

/* ==================================================
   🌍 RUTAS PÚBLICAS
   (SIEMPRE PRIMERO)
================================================== */

router.get(
  "/sellers/top",
  asyncHandler(SellerController.getTopSellers)
);

router.get(
  "/tiendas",
  asyncHandler(SellerController.getSellers)
);

/* ==================================================
   🔐 SELLER ONBOARDING — accessible by any authenticated user
   Must be defined BEFORE the global seller-only middleware below.
================================================== */

router.post(
  "/activate",
  requireAuth,
  asyncHandler(SellerController.activateSeller),
);

// Lightweight entry-point probe — validated via fj_rt refresh cookie.
// Used by the Next.js /seller server component to compute onboarding redirect.
router.get(
  "/entry-point",
  asyncHandler(SellerController.getSellerEntryData),
);

/* ==================================================
   🔐 MIDDLEWARE GLOBAL SELLER
================================================== */

router.use(
  verifyToken(["seller"]),
  requireRole("seller")
);

/* ==================================================
   🔒 RUTAS PRIVADAS (Seller autenticado)
================================================== */

// ==============================
// 📊 Dashboard
// ==============================
router.get(
  "/dashboard",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerDashboard)
);

// ==============================
// 🧾 Órdenes
// ==============================
router.get(
  "/orders",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerOrders)
);

// ==============================
// 📦 Productos del vendedor
// ==============================
router.get(
  "/products",
  asyncHandler(SellerController.getSellerProducts)
);

// ==============================
// 👤 Perfil
// ==============================
router.get(
  "/profile",
  asyncHandler(SellerController.getSellerProfile)
);

router.patch(
  "/profile",
  upload.single("logo"),
  asyncHandler(SellerController.updateSellerProfile)
);

// ==============================
// 🎨 Personalización Tienda
// ==============================
router.put(
  "/customization",
  asyncHandler(SellerController.updateSellerCustomization)
);

// ==============================
// 🏛 Validación legal (KYC)
// ==============================
router.post(
  "/validar",
  upload.fields([
    { name: "foto_dpi_frente", maxCount: 1 },
    { name: "foto_dpi_reverso", maxCount: 1 },
    { name: "selfie_con_dpi", maxCount: 1 },
  ]),
  asyncHandler(SellerController.validateSellerBusiness)
);

// ==============================
// 📈 Analytics
// ==============================
router.get(
  "/analytics",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerAnalytics)
);

router.get(
  "/analytics/daily",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerAnalyticsDaily)
);

// ⚠️ specific paths MUST come before any /:id wildcard
router.get(
  "/analytics/products",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerProductAnalytics)
);

router.get(
  "/analytics/insights",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerInsightsAnalytics)
);

router.get(
  "/analytics/growth",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerGrowthAnalytics)
);

// ==============================
// 🧾 Estado de cuenta
// ==============================
router.get(
  "/account-status",
  asyncHandler(SellerController.getSellerAccountStatus)
);

/* ==================================================
   🎫 TICKETS (SELLER)
================================================== */

// Crear ticket
router.post(
  "/tickets",
  asyncHandler(SellerTicketController.createTicket)
);

// Listar mis tickets
router.get(
  "/tickets",
  asyncHandler(SellerTicketController.getMyTickets)
);

// Detalle ticket
router.get(
  "/tickets/:id",
  asyncHandler(SellerTicketController.getMyTicketDetail)
);

// Responder ticket
router.post(
  "/tickets/:id/reply",
  asyncHandler(SellerTicketController.replyToTicketSeller)
);

router.put(
  "/banner",
  upload.single("banner"),
  asyncHandler(SellerController.updateSellerBanner)
);

router.delete(
  "/banner",
  asyncHandler(SellerController.deleteSellerBanner)
);

export default router;
