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

  // CRUD / detalle
  createProduct,
  getSellerProducts,
  getProductById,
  getProductForEdit,
  updateProduct,
  deleteProduct,
  toggleProductActive,
  deleteProductImage,

  // Públicos
  getFilteredProducts,
  getFilters,
  getProductsByCategory,
  getNewProducts,
} from "../controllers/product.controller";

const router: Router = Router();

/* ---------------------------------------------------------
   📦 1. CATÁLOGOS PÚBLICOS
--------------------------------------------------------- */
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones); // legacy
router.get("/telas", getTelas);

/* ---------------------------------------------------------
   🎨 2. TAXONOMÍA DE ACCESORIOS (público)
--------------------------------------------------------- */
router.get("/accesorios", getAccesorios);
router.get("/accesorio-tipos", getAccesorioTipos);
router.get("/accesorio-materiales", getAccesorioMateriales);

/* ---------------------------------------------------------
   🔍 3. BÚSQUEDAS PÚBLICAS
--------------------------------------------------------- */
router.get("/products", getFilteredProducts);
router.get("/productos", getFilteredProducts); // legacy
router.get("/filters/:tipo", getFilters);
router.get("/categorias/:slug/productos", getProductsByCategory);
router.get("/productos/nuevos", getNewProducts);

/* ---------------------------------------------------------
   📌 4. PRODUCTO — DETALLE PÚBLICO
--------------------------------------------------------- */
router.get("/products/:id", getProductById);
router.get("/productos/:id", getProductById); // legacy

/* ---------------------------------------------------------
   ✏️ 5. PRODUCTO — EDICIÓN (VENDEDOR)
--------------------------------------------------------- */
router.get(
  "/productos/:id/edit",
  requireRole("seller"),
  getProductForEdit
);

/* ---------------------------------------------------------
   🛒 6. CRUD DEL VENDEDOR (PROTEGIDO)
--------------------------------------------------------- */

// Crear producto
router.post(
  "/productos",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
);

// Listado del vendedor
router.get(
  "/seller/productos",
  requireRole("seller"),
  getSellerProducts
);

// Actualizar producto (incluye nuevas imágenes)
router.put(
  "/productos/:id",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  updateProduct
);

// Eliminar producto completo
router.delete(
  "/productos/:id",
  requireRole("seller"),
  deleteProduct
);

// Activar / desactivar producto
router.patch(
  "/productos/:id/activo",
  requireRole("seller"),
  toggleProductActive
);

/* ---------------------------------------------------------
   🖼️ 7. IMÁGENES DEL PRODUCTO (VENDEDOR)
--------------------------------------------------------- */

// Eliminar imagen individual
router.delete(
  "/productos/:id/imagenes/:imageId",
  requireRole("seller"),
  deleteProductImage
);

// 🔒 Obtener producto para edición (SOLO vendedor)
router.get(
  "/productos/:id/edit",
  requireRole("seller"),
  getProductForEdit
);

export default router;

