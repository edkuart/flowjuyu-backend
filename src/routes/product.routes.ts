// src/routes/product.routes.ts
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { uploadProductImages } from "../middleware/multerProducts";

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
  getProductsByCategory,
  getNewProducts,
} from "../controllers/product.controller";

const router: Router = Router(); // 👈 tipo explícito

// ===========================
// 📦 Catálogos (públicos)
// ===========================
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones);
router.get("/telas", getTelas);
router.get("/categorias/:slug/productos", getProductsByCategory);
router.get("/productos/nuevos", getNewProducts);

// 🔹 Accesorios y dependencias
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

// ===========================
// Productos (requiere rol "seller")
// ===========================
router.post(
  "/productos",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct,
);


router.get("/seller/productos", requireRole("seller"), getSellerProducts);
router.get("/productos/:id", requireRole("seller"), getProductById);
router.put("/productos/:id", requireRole("seller"), updateProduct);
router.delete("/productos/:id", requireRole("seller"), deleteProduct);
router.patch(
  "/productos/:id/activo",
  requireRole("seller"),
  toggleProductActive,
);

export default router;
