// src/routes/seller.routes.ts
import { Router } from "express";
import multer from "multer";
import { verifyToken, requireRole } from "../middleware/auth";
import {
  getSellerDashboard,
  getSellerProducts,
  getSellerOrders,
  getSellerProfile,
  updateSellerProfile,
  validateSellerBusiness,
  getSellers,
} from "../controllers/seller.controller";

const router: Router = Router();

// =======================================
// 🧩 Configuración de Multer (para logo)
// =======================================
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Máx 5MB
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|avif)$/.test(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes (png, jpg, webp, avif)"));
    }
    cb(null, true);
  },
});

// =======================================
// 🔐 Rutas privadas (vendedor autenticado)
// =======================================

// Dashboard del vendedor autenticado
router.get("/dashboard", verifyToken(), requireRole("seller"), getSellerDashboard);

// Productos del vendedor autenticado
router.get("/products", verifyToken(), requireRole("seller"), getSellerProducts);

// Pedidos del vendedor autenticado
router.get("/orders", verifyToken(), requireRole("seller"), getSellerOrders);

// ✅ Obtener perfil del vendedor autenticado
router.get("/", verifyToken(), requireRole("seller"), getSellerProfile);

// ✅ Actualizar perfil + subida de logo
router.patch("/", verifyToken(), requireRole("seller"), upload.single("logo"), updateSellerProfile);

// ✅ Enviar documentos para validación (DPI, selfie, registro)
router.post("/validar", verifyToken(), requireRole("seller"), validateSellerBusiness);


// =======================================
// 🌍 Rutas públicas (buyers y visitantes)
// =======================================

// 🔹 Obtener lista de tiendas registradas (ej. top 10)
router.get("/tiendas", getSellers);

// 🔹 Perfil público del vendedor (por id o slug)
router.get("/:id", getSellerProfile);

export default router;
