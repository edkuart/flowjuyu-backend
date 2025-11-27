import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { uploadProductImages } from "../middleware/multerProducts";

import {
  // Catálogos
  getCategorias,
  getClases,
  getRegiones,        // Se deja, pero ya no se expone en búsquedas
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

// ⚠️ Regiones ya no deben usarse, pero se deja por compatibilidad
router.get("/regiones", getRegiones);

router.get("/telas", getTelas);

// ===========================
// 🎨 Taxonomía de Accesorios
// ===========================
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

// ===========================
// 📦 Productos Públicos
// ===========================

// 🔍 Nueva ruta principal
router.get("/products", getFilteredProducts);

// 🔍 Compatibilidad con frontend actual
router.get("/productos", getFilteredProducts);

router.get("/filters/:tipo", getFilters);
router.get("/categorias/:slug/productos", getProductsByCategory);
router.get("/productos/nuevos", getNewProducts);

// ===========================
// 🛒 Productos del vendedor
// ===========================
router.post(
  "/productos",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
);

router.get("/seller/productos", requireRole("seller"), getSellerProducts);
router.get("/productos/:id", requireRole("seller"), getProductById);
router.put("/productos/:id", requireRole("seller"), updateProduct);
router.delete("/productos/:id", requireRole("seller"), deleteProduct);
router.patch("/productos/:id/activo", requireRole("seller"), toggleProductActive);

export default router;
