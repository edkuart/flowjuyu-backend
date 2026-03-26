import { Router, Request, Response } from "express"

import Categoria from "../models/category.model"
import { VendedorPerfil } from "../models/VendedorPerfil"

import { getPublicSellerStore } from "../controllers/seller.controller"
import { createContactTicket } from "../controllers/contact.controller"

const router: ReturnType<typeof Router> = Router()

/* ======================================================
   📩 CONTACTO (PÚBLICO)
====================================================== */

router.post("/contact", createContactTicket)

/* ======================================================
   🧵 CATEGORÍAS (PÚBLICO)
====================================================== */

router.get("/categorias", async (req: Request, res: Response) => {
  try {

    const categorias = await Categoria.findAll({
      attributes: ["id", "nombre", "imagen_url"],
      order: [["nombre", "ASC"]],
    })

    return res.json({
      success: true,
      data: categorias,
    })

  } catch (error) {

    console.error("Error obteniendo categorías:", error)

    return res.status(500).json({
      success: false,
      message: "Error al obtener categorías",
    })
  }
})

/* ======================================================
   🏪 TIENDAS DESTACADAS
====================================================== */

router.get("/vendedores/destacados", async (req: Request, res: Response) => {
  try {

    const vendedores = await VendedorPerfil.findAll({
      attributes: [
        "id",
        "nombre_comercio",
        "logo",
        "departamento",
        "municipio",
        "descripcion",
      ],
      limit: 15,
      order: [["id", "DESC"]],
    })

    return res.json({
      success: true,
      data: vendedores,
    })

  } catch (error) {

    console.error("Error obteniendo vendedores:", error)

    return res.status(500).json({
      success: false,
      message: "Error al obtener vendedores",
    })
  }
})

/* ======================================================
   🏪 TIENDA PÚBLICA
====================================================== */

// /api/public/seller/:id  ← canonical URL (used by all frontend calls)
// IMPORTANT: do NOT add a /seller/:id alias here — it would shadow
// the authenticated seller routes (/api/seller/profile, /api/seller/products, etc.)
// which are mounted via app.use("/api/seller", sellerRoutes) and
// app.use("/api", productRoutes) later in app.ts.
router.get("/public/seller/:id", getPublicSellerStore)

export default router