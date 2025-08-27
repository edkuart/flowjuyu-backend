import { Router } from "express"
import { requireAuth } from "../middleware/authJwt"
import { getCategorias, getClases, getRegiones, getTelas, createProduct, uploadProductImages } from "../controllers/product.controller"

const router = Router()
router.get("/api/categorias", getCategorias)
router.get("/api/clases", getClases)
router.get("/api/regiones", getRegiones)
router.get("/api/telas", getTelas)
router.post(
  "/api/productos",
  requireAuth("seller"),
  uploadProductImages.array("imagenes[]", 9),
  createProduct
)
export default router
