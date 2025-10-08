// src/routes/product.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/authJwt";               // ✅ middleware correcto
import { uploadProductImages } from "../middleware/multerProducts"; // ✅ multer correcto

import {
  getCategorias,
  getClases,
  getRegiones,
  getTelas,
  getAccesorios,
  getAccesorioTipos,
  getAccesorioMateriales,
  createProduct,
  getSellerProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductActive,
} from "../controllers/product.controller";

const router = Router();

// ===========================
// 📦 Catálogos (públicos)
// ===========================
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones);
router.get("/telas", getTelas);

// 🔹 Accesorios y dependencias
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

// ===========================
// 🧾 Productos (requiere rol "seller")
// ===========================
router.post(
  "/productos",
  requireAuth("seller"),
  uploadProductImages.array("imagenes[]", 9), // 📤 subir imágenes
  createProduct
);

router.get("/seller/productos", requireAuth("seller"), getSellerProducts);
router.get("/productos/:id", requireAuth("seller"), getProductById);

router.put(
  "/productos/:id",
  requireAuth("seller"),
  uploadProductImages.array("imagenes[]", 1), // 📤 reemplazo de 1 imagen
  updateProduct
);

router.delete("/productos/:id", requireAuth("seller"), deleteProduct);
router.patch("/productos/:id/activo", requireAuth("seller"), toggleProductActive);

export default router;
