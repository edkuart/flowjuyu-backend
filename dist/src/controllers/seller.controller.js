"use strict";
// src/controllers/seller.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSellerBusiness = exports.updateSellerProfile = exports.getSellerProfile = exports.getSellerProducts = exports.getSellerOrders = exports.getSellerDashboard = void 0;
const VendedorPerfil_1 = require("../models/VendedorPerfil");
const user_model_1 = require("../models/user.model");
// ==============================
// Dashboard general del vendedor
// ==============================
const getSellerDashboard = async (req, res) => {
    try {
        const user = req.user;
        res.json({
            ok: true,
            message: "Bienvenido al panel del vendedor",
            user,
        });
    }
    catch (error) {
        console.error("Error en getSellerDashboard:", error);
        res.status(500).json({ ok: false, message: "Error al cargar el dashboard" });
    }
};
exports.getSellerDashboard = getSellerDashboard;
// ==============================
// Pedidos del vendedor
// ==============================
const getSellerOrders = async (_req, res) => {
    try {
        res.json({
            ok: true,
            message: "Pedidos del vendedor (pendiente de implementar)",
            data: [],
        });
    }
    catch (error) {
        console.error("Error en getSellerOrders:", error);
        res.status(500).json({ ok: false, message: "Error al obtener pedidos" });
    }
};
exports.getSellerOrders = getSellerOrders;
// ==============================
// Productos del vendedor
// ==============================
const getSellerProducts = async (_req, res) => {
    try {
        res.json({
            ok: true,
            message: "Productos del vendedor (pendiente de implementar)",
            data: [],
        });
    }
    catch (error) {
        console.error("Error en getSellerProducts:", error);
        res.status(500).json({ ok: false, message: "Error al obtener productos" });
    }
};
exports.getSellerProducts = getSellerProducts;
// ==============================
// Perfil del vendedor
// ==============================
const getSellerProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ ok: false, message: "Usuario no autenticado" });
            return;
        }
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: user.id }, // 👈 usa el nombre real de columna
            include: [
                {
                    model: user_model_1.User,
                    as: "user",
                    attributes: ["id", "nombre", "correo", "rol"],
                },
            ],
        });
        if (!perfil) {
            res.status(404).json({ ok: false, message: "Perfil no encontrado" });
            return;
        }
        res.json({
            ok: true,
            perfil,
        });
    }
    catch (error) {
        console.error("Error en getSellerProfile:", error);
        res.status(500).json({ ok: false, message: "Error al obtener perfil" });
    }
};
exports.getSellerProfile = getSellerProfile;
// ==============================
// Actualizar perfil
// ==============================
const updateSellerProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ ok: false, message: "No autorizado" });
            return;
        }
        await VendedorPerfil_1.VendedorPerfil.update(req.body, { where: { user_id: user.id } });
        res.json({ ok: true, message: "Perfil actualizado correctamente" });
    }
    catch (error) {
        console.error("Error en updateSellerProfile:", error);
        res.status(500).json({ ok: false, message: "Error al actualizar perfil" });
    }
};
exports.updateSellerProfile = updateSellerProfile;
// ==============================
// Enviar documentos de validación
// ==============================
const validateSellerBusiness = async (_req, res) => {
    try {
        res.json({
            ok: true,
            message: "Documentos enviados para validación del comercio (pendiente de implementar)",
        });
    }
    catch (error) {
        console.error("Error en validateSellerBusiness:", error);
        res.status(500).json({ ok: false, message: "Error al procesar validación" });
    }
};
exports.validateSellerBusiness = validateSellerBusiness;
