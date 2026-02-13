//scr/routes/product.routes.ts

import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { uploadProductImages } from "../middleware/multerProducts";
import asyncHandler from "../middleware/asyncHandler";

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
  setPrincipalImage,

  // Públicos
  getFilteredProducts,
  getFilters,
  getProductsByCategory,
  getNewProducts,
  getTrendingProducts,

  getTopProductsByCategory,
  getProductReviews,
  createProductReview,

} from "../controllers/product.controller";

const router: Router = Router();

/* ---------------------------------------------------------
   📦 1. CATÁLOGOS PÚBLICOS
--------------------------------------------------------- */
router.get("/categorias", getCategorias);
router.get("/clases", getClases);
router.get("/regiones", getRegiones);
router.get("/telas", getTelas);

/* ---------------------------------------------------------
   🎨 2. TAXONOMÍA DE ACCESORIOS
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
router.get("/products/trending", getTrendingProducts);

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
   🛒 6. CRUD DEL VENDEDOR
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
  "/seller/products",
  requireRole("seller"),
  getSellerProducts
);

// Actualizar producto
router.put(
  "/productos/:id",
  requireRole("seller"),
  uploadProductImages.array("imagenes[]", 9),
  updateProduct
);

// Cambiar imagen principal
router.patch(
  "/productos/:id/set-principal",
  requireRole("seller"),
  setPrincipalImage
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
   🖼️ 7. IMÁGENES DEL PRODUCTO
--------------------------------------------------------- */

// Eliminar imagen individual
router.delete(
  "/productos/:id/imagenes/:imageId",
  requireRole("seller"),
  deleteProductImage
);

router.get(
  "/products/top-by-category/:categoriaId",
  asyncHandler(getTopProductsByCategory)
);

router.get("/products/:id/reviews", getProductReviews);

router.post(
  "/products/:id/reviews",
  requireRole("comprador"),
  createProductReview
);

export default router;
