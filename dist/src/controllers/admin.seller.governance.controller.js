"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactivateSeller = exports.suspendSeller = exports.rejectSeller = exports.approveSeller = exports.getSellerDetail = exports.getAllSellers = void 0;
const VendedorPerfil_1 = require("../models/VendedorPerfil");
const user_model_1 = require("../models/user.model");
const adminAuditEvent_model_1 = __importDefault(require("../models/adminAuditEvent.model"));
const logAdminEvent_1 = require("../utils/logAdminEvent");
const product_model_1 = __importDefault(require("../models/product.model"));
const getAllSellers = async (req, res) => {
    try {
        const { estado_validacion, estado_admin } = req.query;
        const where = {};
        if (estado_validacion) {
            where.estado_validacion = estado_validacion;
        }
        if (estado_admin) {
            where.estado_admin = estado_admin;
        }
        const sellers = await VendedorPerfil_1.VendedorPerfil.findAll({
            where,
            include: [
                {
                    model: user_model_1.User,
                    as: "user",
                    attributes: ["id", "nombre", "correo"],
                },
            ],
            order: [["createdAt", "DESC"]],
        });
        const enriched = await Promise.all(sellers.map(async (seller) => {
            const totalProductos = await product_model_1.default.count({
                where: { vendedor_id: seller.user_id },
            });
            const productosPublicados = await product_model_1.default.count({
                where: {
                    vendedor_id: seller.user_id,
                    activo: true,
                },
            });
            const publicadosReales = seller.estado_admin === "activo" &&
                seller.estado_validacion === "aprobado"
                ? productosPublicados
                : 0;
            return {
                ...seller.toJSON(),
                total_productos: totalProductos,
                productos_publicados: publicadosReales,
            };
        }));
        res.json({
            ok: true,
            data: enriched,
        });
    }
    catch (error) {
        console.error("getAllSellers error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getAllSellers = getAllSellers;
const getSellerDetail = async (req, res) => {
    try {
        const sellerId = Number(req.params.id);
        const seller = await VendedorPerfil_1.VendedorPerfil.findByPk(sellerId, {
            include: [
                {
                    model: user_model_1.User,
                    as: "user",
                    attributes: ["id", "nombre", "correo", "telefono"],
                },
            ],
        });
        if (!seller) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        const history = await adminAuditEvent_model_1.default.findAll({
            where: {
                entity_type: "seller",
                entity_id: sellerId,
            },
            order: [["created_at", "DESC"]],
        });
        res.json({
            ok: true,
            data: {
                ...seller.toJSON(),
                audit_log: history,
            },
        });
    }
    catch (error) {
        console.error("getSellerDetail error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getSellerDetail = getSellerDetail;
const approveSeller = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const adminId = Number(req.user.id);
        const seller = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: userId },
        });
        if (!seller) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        if (seller.estado_validacion !== "pendiente") {
            res.status(409).json({
                message: "Solo vendedores pendientes pueden aprobarse",
            });
            return;
        }
        if (seller.kyc_score < 80) {
            res.status(400).json({
                message: "No se puede aprobar. Riesgo demasiado alto.",
            });
            return;
        }
        const before = {
            estado_validacion: seller.estado_validacion,
            estado_admin: seller.estado_admin,
        };
        seller.estado_validacion = "aprobado";
        seller.estado_admin = "activo";
        await seller.save();
        await (0, logAdminEvent_1.logAdminEvent)({
            entityType: "seller",
            entityId: seller.id,
            action: "KYC_APPROVED",
            performedBy: adminId,
            metadata: {
                before,
                after: {
                    estado_validacion: seller.estado_validacion,
                    estado_admin: seller.estado_admin,
                },
                kyc_score: seller.kyc_score,
            },
        });
        res.json({
            ok: true,
            message: "Vendedor aprobado correctamente",
        });
    }
    catch (error) {
        console.error("approveSeller error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.approveSeller = approveSeller;
const rejectSeller = async (req, res) => {
    try {
        const sellerId = Number(req.params.id);
        const adminId = Number(req.user.id);
        const { comment } = req.body;
        if (!comment) {
            res.status(400).json({
                message: "Comentario obligatorio al rechazar",
            });
            return;
        }
        const seller = await VendedorPerfil_1.VendedorPerfil.findByPk(sellerId);
        if (!seller) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        if (seller.estado_validacion !== "pendiente") {
            res.status(409).json({
                message: "Solo vendedores pendientes pueden rechazarse",
            });
            return;
        }
        const before = {
            estado_validacion: seller.estado_validacion,
            estado_admin: seller.estado_admin,
        };
        seller.estado_validacion = "rechazado";
        seller.estado_admin = "inactivo";
        seller.observaciones = comment;
        await seller.save();
        await (0, logAdminEvent_1.logAdminEvent)({
            entityType: "seller",
            entityId: seller.id,
            action: "KYC_REJECTED",
            performedBy: adminId,
            comment,
            metadata: {
                before,
                after: {
                    estado_validacion: seller.estado_validacion,
                    estado_admin: seller.estado_admin,
                },
            },
        });
        res.json({ ok: true, message: "Vendedor rechazado correctamente" });
    }
    catch (error) {
        console.error("rejectSeller error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.rejectSeller = rejectSeller;
const suspendSeller = async (req, res) => {
    try {
        const sellerId = Number(req.params.id);
        const adminId = Number(req.user.id);
        const seller = await VendedorPerfil_1.VendedorPerfil.findByPk(sellerId);
        if (!seller) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        const before = {
            estado_admin: seller.estado_admin,
        };
        seller.estado_admin = "suspendido";
        await seller.save();
        await (0, logAdminEvent_1.logAdminEvent)({
            entityType: "seller",
            entityId: seller.id,
            action: "SELLER_SUSPENDED",
            performedBy: adminId,
            metadata: {
                before,
                after: {
                    estado_admin: seller.estado_admin,
                },
            },
        });
        res.json({
            ok: true,
            message: "Vendedor suspendido correctamente",
        });
    }
    catch (error) {
        console.error("suspendSeller error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.suspendSeller = suspendSeller;
const reactivateSeller = async (req, res) => {
    try {
        const sellerId = Number(req.params.id);
        const adminId = Number(req.user.id);
        const seller = await VendedorPerfil_1.VendedorPerfil.findByPk(sellerId);
        if (!seller) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        const before = {
            estado_admin: seller.estado_admin,
        };
        seller.estado_admin = "activo";
        await seller.save();
        await (0, logAdminEvent_1.logAdminEvent)({
            entityType: "seller",
            entityId: seller.id,
            action: "SELLER_REACTIVATED",
            performedBy: adminId,
            metadata: {
                before,
                after: {
                    estado_admin: seller.estado_admin,
                },
            },
        });
        res.json({
            ok: true,
            message: "Vendedor reactivado correctamente",
        });
    }
    catch (error) {
        console.error("reactivateSeller error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.reactivateSeller = reactivateSeller;
