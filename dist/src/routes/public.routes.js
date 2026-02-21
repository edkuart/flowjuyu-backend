"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const category_model_1 = __importDefault(require("../models/category.model"));
const VendedorPerfil_1 = require("../models/VendedorPerfil");
const seller_controller_1 = require("../controllers/seller.controller");
const router = (0, express_1.Router)();
router.get("/categorias", async (req, res) => {
    try {
        const categorias = await category_model_1.default.findAll({
            attributes: ["id", "nombre", "imagen_url"],
            order: [["nombre", "ASC"]],
        });
        res.json(categorias);
    }
    catch (error) {
        console.error("Error obteniendo categorías:", error);
        res.status(500).json({ error: "Error al obtener categorías" });
    }
});
router.get("/vendedores/destacados", async (req, res) => {
    try {
        const vendedores = await VendedorPerfil_1.VendedorPerfil.findAll({
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
    }
    catch (error) {
        console.error("Error obteniendo vendedores:", error);
        res.status(500).json({ error: "Error al obtener vendedores" });
    }
});
router.get("/public/seller/:id", seller_controller_1.getPublicSellerStore);
exports.default = router;
