// src/routes/seller.routes.ts
import { Router } from "express";
import multer from "multer";
import asyncHandler from "../utils/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
import * as SellerController from "../controllers/seller.controller";

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
   🔐 RUTAS PRIVADAS (Seller autenticado)
================================================== */

router.get(
  "/dashboard",
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerDashboard)
);

router.get(
  "/products",
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerProducts)
);

router.get(
  "/orders",
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerOrders)
);

router.get(
  "/profile",
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerProfile)
);

router.patch(
  "/profile",
  verifyToken(),
  requireRole("seller"),
  upload.single("logo"),
  asyncHandler(SellerController.updateSellerProfile)
);

router.post(
  "/validar",
  verifyToken(),
  requireRole("seller"),
  upload.fields([
    { name: "foto_dpi_frente", maxCount: 1 },
    { name: "foto_dpi_reverso", maxCount: 1 },
    { name: "selfie_con_dpi", maxCount: 1 },
  ]),
  asyncHandler(SellerController.validateSellerBusiness)
);

router.get(
  "/analytics",
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerAnalytics)
);

router.get(
  "/analytics/daily",
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerAnalyticsDaily)
);

router.get(
  "/account-status", 
  verifyToken(),
  requireRole("seller"),
  asyncHandler(SellerController.getSellerAccountStatus)
);

router.get(
  "/dashboard",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(SellerController.getSellerDashboard)
);

/* ==================================================
   🌍 RUTAS PÚBLICAS
================================================== */

router.get("/sellers/top", asyncHandler(SellerController.getTopSellers));
router.get("/tiendas", asyncHandler(SellerController.getSellers));

// ⚠️ ESTA SIEMPRE AL FINAL
router.get("/:id", asyncHandler(SellerController.getSellerProfile));

export default router;