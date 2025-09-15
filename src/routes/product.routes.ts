import { Router } from "express"
import { requireAuth } from "../middleware/authJwt"
import {
  getCategorias,
  getClases,
  getRegiones,
  getTelas,
  getAccesorios,
  getAccesorioTipos,
  getAccesorioMateriales,
  createProduct,
  uploadProductImages,
  getSellerProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductActive,
} from "../controllers/product.controller"

const router = Router()

// ===========================
// 📦 Catálogos (públicos)
// ===========================
router.get("/categorias", getCategorias)
router.get("/clases", getClases)
router.get("/regiones", getRegiones)
router.get("/telas", getTelas)

// 🔹 Nuevos: accesorios y dependencias
router.get("/accesorios", getAccesorios)
router.get("/accesorio-tipos", getAccesorioTipos)          // ?accesorio_id=1
router.get("/accesorio-materiales", getAccesorioMateriales) // ?accesorio_id=1

// ===========================
// Productos (requiere vendedor autenticado)
// ===========================
router.post(
  "/productos",
  requireAuth("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
)

router.get("/seller/productos", requireAuth("seller"), getSellerProducts)

router.get("/productos/:id", requireAuth("seller"), getProductById)

router.put("/productos/:id", requireAuth("seller"), updateProduct)

router.delete("/productos/:id", requireAuth("seller"), deleteProduct)

router.patch("/productos/:id/activo", requireAuth("seller"), toggleProductActive)

export default router
