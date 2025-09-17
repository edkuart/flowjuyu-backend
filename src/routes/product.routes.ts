import { Router } from "express"
import { requireAuth } from "../middleware/authJwt"
import {
  getCategorias,
  getClases,
  getRegiones,
  getTelas,
  createProduct,
  uploadProductImages,
  getSellerProducts,
  getLatestProducts, 
 getAllProducts,
} from "../controllers/product.controller"

const router = Router()

// 📦 Catálogos
router.get("/categorias", getCategorias)
router.get("/clases", getClases)
router.get("/regiones", getRegiones)
router.get("/telas", getTelas)

// ➕ Crear producto
router.post(
  "/productos",
  requireAuth("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
)

// 📋 Listar productos del vendedor autenticado
router.get(
  "/seller/productos",
  requireAuth("seller"),
  getSellerProducts
)

// Listar los productos más recientes (para el HomePage)
router.get("/productos/latest", getLatestProducts) 
router.get("/productos", getAllProducts)
export default router
