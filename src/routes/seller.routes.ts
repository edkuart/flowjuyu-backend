// src/routes/seller.routes.ts

import { Router } from "express";
import multer from "multer";
import asyncHandler from "../utils/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
import * as SellerController from "../controllers/seller.controller";
import * as SellerTicketController from "../controllers/sellerTicket.controller";

const router = Router();

/* ==================================================
   📦 Configuración Multer
================================================== */

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|avif)$/.test(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes (png, jpg, webp, avif)"));
    }
    cb(null, true);
  },
});

/* ==================================================
   🌍 RUTAS PÚBLICAS
   (SIEMPRE PRIMERO)
================================================== */

router.get("/sellers/top", asyncHandler(SellerController.getTopSellers));
router.get("/tiendas", asyncHandler(SellerController.getSellers));

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

// Dashboard (requiere vendedor activo)
router.get(
  "/dashboard",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerDashboard)
);

// Productos del seller
router.get(
  "/products",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerProducts)
);

// Órdenes (placeholder futuro)
router.get(
  "/orders",
  requireActiveSeller,
  asyncHandler(SellerController.getSellerOrders)
);

// Perfil
router.get(
  "/profile",
  asyncHandler(SellerController.getSellerProfile)
);

router.patch(
  "/profile",
  upload.single("logo"),
  asyncHandler(SellerController.updateSellerProfile)
);

// Validación legal (NO requiere active seller aún)
router.post(
  "/validar",
  upload.fields([
    { name: "foto_dpi_frente", maxCount: 1 },
    { name: "foto_dpi_reverso", maxCount: 1 },
    { name: "selfie_con_dpi", maxCount: 1 },
  ]),
  asyncHandler(SellerController.validateSellerBusiness)
);

// Analytics
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

// Estado de cuenta (NO requiere activo)
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

// Detalle de un ticket
router.get(
  "/tickets/:id",
  asyncHandler(SellerTicketController.getMyTicketDetail)
);

// Responder ticket
router.post(
  "/tickets/:id/reply",
  asyncHandler(SellerTicketController.replyToTicketSeller)
);

/* ==================================================
   ⚠️ ESTA SIEMPRE AL FINAL
================================================== */

router.get("/:id", asyncHandler(SellerController.getSellerProfile));

export default router;
