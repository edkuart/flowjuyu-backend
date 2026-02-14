import { Router } from "express";
import Categoria from "../models/category.model"; // ✔ nombre correcto
import Producto from "../models/product.model";   // ✔ existe
import { VendedorPerfil } from "../models/VendedorPerfil"; // ✔ exportación correcta
import { getPublicSellerStore } from "../controllers/seller.controller";

const router = Router();

/* ============================
   CATEGORÍAS (PÚBLICO)
=============================== */
router.get("/categorias", async (req, res) => {
  try {
    const categorias = await Categoria.findAll({
      attributes: ["id", "nombre", "imagen_url"],
      order: [["nombre", "ASC"]],
    });

    res.json(categorias);
  } catch (error) {
    console.error("Error obteniendo categorías:", error);
    res.status(500).json({ error: "Error al obtener categorías" });
  }
});

/* ============================
   TIENDAS DESTACADAS (PÚBLICO)
=============================== */
router.get("/vendedores/destacados", async (req, res) => {
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
    });

    res.json(vendedores);
  } catch (error) {
    console.error("Error obteniendo vendedores:", error);
    res.status(500).json({ error: "Error al obtener vendedores" });
  }
});

router.get("/public/seller/:id", getPublicSellerStore);

export default router;
