import { Router } from "express";
import { requireRole } from "../middleware/auth"; // ✅ Middleware de roles moderno (usa JWT seguro)
import { uploadProductImages } from "../middleware/multerProducts";

import {
  // Catálogos básicos
  getCategorias,
  getClases,
  getRegiones,
  getTelas,

  // Accesorios y dependencias
  getAccesorios,
  getAccesorioTipos,
  getAccesorioMateriales,

  // Productos
  createProduct,
  getSellerProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductActive,

  // Catálogos extendidos
  getProductsByCategory,
  getNewProducts,
} from "../controllers/product.controller";

const router: Router = Router();

// ===========================
// 📦 Catálogos públicos
// ===========================
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones);
router.get("/telas", getTelas);

// 🔹 Accesorios y sus dependencias
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

// 🔹 Catálogos extendidos (para Home y exploración)
router.get("/categorias/:slug/productos", getProductsByCategory);
router.get("/productos/nuevos", getNewProducts);

// ===========================
// 🧾 Productos (requiere rol "seller")
// ===========================
router.post(
  "/productos",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
);

router.get("/seller/productos", requireRole("seller"), getSellerProducts);
router.get("/productos/:id", requireRole("seller"), getProductById);

// 🛠 Actualización de producto
router.put(
  "/productos/:id",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9), // si el usuario actualiza imágenes
  updateProduct
);

// 🗑 Eliminación y activación
router.delete("/productos/:id", requireRole("seller"), deleteProduct);
router.patch("/productos/:id/activo", requireRole("seller"), toggleProductActive);

export default router;
