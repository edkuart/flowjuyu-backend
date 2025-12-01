// src/routes/product.routes.ts
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { uploadProductImages } from "../middleware/multerProducts";

import {
  // Catálogos
  getCategorias,
  getClases,
  getRegiones,
  getTelas,

  // Accesorios
  getAccesorios,
  getAccesorioTipos,
  getAccesorioMateriales,

  // CRUD vendedor
  createProduct,
  getSellerProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductActive,

  // Búsquedas / filtros públicos
  getFilteredProducts,
  getFilters,
  getProductsByCategory,
  getNewProducts,
} from "../controllers/product.controller";

const router: Router = Router();

// ===========================
// 📦 Catálogos Públicos
// ===========================
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones); // compatibilidad
router.get("/telas", getTelas);

// ===========================
// 🎨 Taxonomía de Accesorios
// ===========================
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

// ===========================
// 🔍 Productos públicos (explorar / home)
// ===========================

// ⚡ Filtros dinámicos (búsqueda principal)
router.get("/products", getFilteredProducts);
router.get("/productos", getFilteredProducts); // compatibilidad frontend

// Filtros únicos
router.get("/filters/:tipo", getFilters);

// Productos por categoría (slug)
router.get("/categorias/:slug/productos", getProductsByCategory);

// Nuevos productos (home)
router.get("/productos/nuevos", getNewProducts);

// ===========================
// 🛒 CRUD del Vendedor
// ===========================
router.post(
  "/productos",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
);

router.get(
  "/seller/productos",
  requireRole("seller"),
  getSellerProducts
);

router.get(
  "/productos/:id",
  requireRole("seller"),
  getProductById
);

// 🛠 PUT ahora permite subir imágenes ✔
router.put(
  "/productos/:id",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  updateProduct
);

// 🗑 Eliminar
router.delete(
  "/productos/:id",
  requireRole("seller"),
  deleteProduct
);

// 🔄 Activar / desactivar
router.patch(
  "/productos/:id/activo",
  requireRole("seller"),
  toggleProductActive
);

export default router;
