// src/routes/seller.routes.ts
import { Router } from "express";
import multer from "multer";
import asyncHandler from "../utils/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import * as SellerController from "../controllers/seller.controller";

const router = Router();

// ===========================
//  Configuración de Multer
// ===========================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // máx 5MB
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|avif)$/.test(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes (png, jpg, webp, avif)"));
    }
    cb(null, true);
  },
});

// ==================================================
//  Rutas privadas (solo vendedores autenticados)
// =================================================

//  Dashboard general del vendedor
router.get(
  "/dashboard",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerDashboard)
);

//  Listado de productos del vendedor
router.get(
  "/products",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerProducts)
);

//  Pedidos del vendedor
router.get(
  "/orders",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerOrders)
);

//  Obtener perfil del vendedor autenticado
router.get(
  "/profile",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerProfile)
);

//  Actualizar perfil (con subida o eliminación de logo)
router.patch(
  "/profile",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  upload.single("logo"),
  asyncHandler(SellerController.updateSellerProfile)
);

//  Enviar documentos para validación
router.post(
  "/validar",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.validateSellerBusiness)
);

// ==================================================
//  Rutas públicas (buyers / visitantes)
// ==================================================

// Listado público de tiendas/vendedores
router.get("/tiendas", asyncHandler(SellerController.getSellers));

//  Perfil público de un vendedor (por ID o slug)
router.get("/:id", asyncHandler(SellerController.getSellerProfile));

// ==================================================
// 🔐 Rutas privadas (solo vendedores autenticados)
// ==================================================

// 📊 Dashboard general del vendedor
router.get(
  "/dashboard",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerDashboard)
);

// 📦 Listado de productos del vendedor
router.get(
  "/products",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerProducts)
);

// 🧾 Pedidos del vendedor
router.get(
  "/orders",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerOrders)
);

// 👤 Obtener perfil del vendedor autenticado
router.get(
  "/profile",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.getSellerProfile)
);

// ✏️ Actualizar perfil (con subida o eliminación de logo)
router.patch(
  "/profile",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  upload.single("logo"),
  asyncHandler(SellerController.updateSellerProfile)
);

// 🧾 Enviar documentos para validación
router.post(
  "/validar",
  verifyToken(["seller", "vendedor"]),
  requireRole("seller", "vendedor"),
  asyncHandler(SellerController.validateSellerBusiness)
);

// ==================================================
// 🌍 Rutas públicas (buyers / visitantes)
// ==================================================

// 🏪 Listado público de tiendas/vendedores
router.get("/tiendas", asyncHandler(SellerController.getSellers));

// 👁️ Perfil público de un vendedor (por ID)
router.get("/:id", asyncHandler(SellerController.getSellerProfile));

// ==================================================
// ✅ Exportación por defecto
// ==================================================
export default router;
