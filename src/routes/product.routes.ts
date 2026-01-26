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

/* ---------------------------------------------------------
   📦 1. CATÁLOGOS PÚBLICOS  (sin auth)
--------------------------------------------------------- */
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones); // compatibilidad
router.get("/telas", getTelas);

/* ---------------------------------------------------------
   🎨 2. TAXONOMÍA DE ACCESORIOS (público)
--------------------------------------------------------- */
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

/* ---------------------------------------------------------
   🔍 3. BÚSQUEDAS PÚBLICAS (productos visibles)
--------------------------------------------------------- */
router.get("/products", getFilteredProducts);     // nuevo estándar
router.get("/productos", getFilteredProducts);    // compatibilidad legacy

router.get("/filters/:tipo", getFilters);
router.get("/categorias/:slug/productos", getProductsByCategory);
router.get("/productos/nuevos", getNewProducts);

/* ---------------------------------------------------------
   📌 4. PRODUCTOS — RUTA PÚBLICA (DETALLE)
      ⚠ IMPORTANTE: esta DEBE ser PÚBLICA
--------------------------------------------------------- */

// Nuevo endpoint estándar
router.get("/products/:id", getProductById);

// Compatibilidad con versiones anteriores
router.get("/productos/:id", getProductById);

/* ---------------------------------------------------------
   🛒 5. CRUD DEL VENDEDOR (PROTEGIDO con token)
--------------------------------------------------------- */

// Crear producto (requiere rol vendedor)
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
// Obtener los productos del vendedor
router.get("/seller/productos", requireRole("seller"), getSellerProducts);

// Editar, eliminar, activar/desactivar — SOLO vendedor
router.put("/productos/:id", requireRole("seller"), updateProduct);
router.delete("/productos/:id", requireRole("seller"), deleteProduct);
router.patch("/productos/:id/activo", requireRole("seller"), toggleProductActive);

export default router;
