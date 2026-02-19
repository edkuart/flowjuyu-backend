// src/routes/product.routes.ts

import { Router } from "express";
import { verifyToken, requireRole } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
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

/* =========================================================
   📦 1. CATÁLOGOS PÚBLICOS
========================================================= */
router.get("/categorias", asyncHandler(getCategorias));
router.get("/clases", asyncHandler(getClases));
router.get("/regiones", asyncHandler(getRegiones));
router.get("/telas", asyncHandler(getTelas));

/* =========================================================
   🎨 2. TAXONOMÍA ACCESORIOS (PÚBLICO)
========================================================= */
router.get("/accesorios", asyncHandler(getAccesorios));
router.get("/accesorio-tipos", asyncHandler(getAccesorioTipos));
router.get("/accesorio-materiales", asyncHandler(getAccesorioMateriales));

/* =========================================================
   🔍 3. BÚSQUEDAS PÚBLICAS
========================================================= */
router.get("/products", asyncHandler(getFilteredProducts));
router.get("/productos", asyncHandler(getFilteredProducts)); // legacy
router.get("/filters/:tipo", asyncHandler(getFilters));
router.get("/categorias/:slug/productos", asyncHandler(getProductsByCategory));
router.get("/productos/nuevos", asyncHandler(getNewProducts));
router.get("/products/trending", asyncHandler(getTrendingProducts));
router.get(
  "/products/top-by-category/:categoriaId",
  asyncHandler(getTopProductsByCategory)
);

/* =========================================================
   📌 4. PRODUCTO — DETALLE PÚBLICO
========================================================= */
router.get("/products/:id", asyncHandler(getProductById));
router.get("/productos/:id", asyncHandler(getProductById)); // legacy
router.get("/products/:id/reviews", asyncHandler(getProductReviews));

router.post(
  "/products/:id/reviews",
  verifyToken(["buyer"]),
  requireRole("buyer"),
  asyncHandler(createProductReview)
);

/* =========================================================
   🛒 5. CRUD VENDEDOR (RUTAS PRIVADAS)
========================================================= */

// Crear producto
router.post(
  "/productos",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  uploadProductImages.array("imagenes[]", 5),
  asyncHandler(createProduct)
);

// Listado del vendedor
router.get(
  "/seller/products",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(getSellerProducts)
);

// Obtener producto para editar
router.get(
  "/productos/:id/edit",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(getProductForEdit)
);

// Actualizar producto
router.put(
  "/productos/:id",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  uploadProductImages.array("imagenes[]", 5),
  asyncHandler(updateProduct)
);

// Cambiar imagen principal
router.patch(
  "/productos/:id/set-principal",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(setPrincipalImage)
);

// Activar / desactivar
router.patch(
  "/productos/:id/activo",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(toggleProductActive)
);

// Eliminar producto
router.delete(
  "/productos/:id",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(deleteProduct)
);

/* =========================================================
   🖼️ 6. IMÁGENES INDIVIDUALES
========================================================= */

router.delete(
  "/productos/:id/imagenes/:imageId",
  verifyToken(["seller"]),
  requireRole("seller"),
  requireActiveSeller,
  asyncHandler(deleteProductImage)
);

export default router;
