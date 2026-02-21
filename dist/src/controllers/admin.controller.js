"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewSellerKYC = exports.getAdminProductDetail = exports.getAllAdminProducts = exports.replyToTicketAdmin = exports.changeTicketStatus = exports.assignTicket = exports.getTicketDetailAdmin = exports.getAllTickets = exports.rechazarVendedor = exports.aprobarVendedor = exports.getSellerForValidation = exports.getPendingSellers = exports.getAdminDashboard = void 0;
const db_1 = require("../config/db");
const user_model_1 = require("../models/user.model");
const VendedorPerfil_1 = require("../models/VendedorPerfil");
const ticket_model_1 = require("../models/ticket.model");
const ticketMessage_model_1 = require("../models/ticketMessage.model");
const logAdminEvent_1 = require("../utils/logAdminEvent");
const getAdminDashboard = async (req, res) => {
    try {
        const [[usuarios]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM users
    `);
        const [[sellersPendientes]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS pendientes
      FROM vendedor_perfil
      WHERE estado_validacion = 'pendiente'
    `);
        const [[productosActivos]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS activos
      FROM productos p
      JOIN vendedor_perfil s 
        ON s.user_id = p.vendedor_id
      WHERE 
        p.activo = true
        AND s.estado_admin = 'activo'
        AND s.estado_validacion = 'aprobado'
    `);
        const [[ticketsAbiertos]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS abiertos
      FROM tickets
      WHERE estado = 'abierto'
    `);
        const [[ticketsEnProceso]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS en_proceso
      FROM tickets
      WHERE estado = 'en_proceso'
    `);
        const [[ticketsCerrados]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS cerrados
      FROM tickets
      WHERE estado = 'cerrado'
    `);
        const [ultimosProductos] = await db_1.sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.activo,
        s.nombre_comercio AS vendedor_nombre
      FROM productos p
      JOIN vendedor_perfil s 
        ON s.user_id = p.vendedor_id
      WHERE 
        p.activo = true
        AND s.estado_admin = 'activo'
        AND s.estado_validacion = 'aprobado'
      ORDER BY p.created_at DESC
      LIMIT 5
    `);
        const [ultimosSellers] = await db_1.sequelize.query(`
      SELECT 
        s.user_id,
        s.nombre_comercio,
        s.estado_validacion,
        s.estado_admin
      FROM vendedor_perfil s
      WHERE s.estado_validacion = 'aprobado'
      ORDER BY s."createdAt" DESC
      LIMIT 5
    `);
        res.json({
            success: true,
            data: {
                usuarios,
                sellers: sellersPendientes,
                productos: {
                    activos: productosActivos.activos,
                    inactivos: 0,
                },
                tickets: {
                    abiertos: ticketsAbiertos.abiertos,
                    en_proceso: ticketsEnProceso.en_proceso,
                    cerrados: ticketsCerrados.cerrados,
                },
                ultimosProductos,
                ultimosSellers,
            },
        });
    }
    catch (error) {
        console.error("Error getAdminDashboard:", error);
        res.status(500).json({
            success: false,
            message: "Error obteniendo dashboard",
        });
    }
};
exports.getAdminDashboard = getAdminDashboard;
const getPendingSellers = async (_req, res) => {
    try {
        const sellers = await VendedorPerfil_1.VendedorPerfil.findAll({
            where: { estado_validacion: "pendiente" },
            include: [
                {
                    model: user_model_1.User,
                    as: "user",
                    attributes: ["id", "nombre", "correo", "telefono"],
                },
            ],
            order: [["createdAt", "ASC"]],
        });
        res.json({ ok: true, data: sellers });
    }
    catch (error) {
        console.error("Error getPendingSellers:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getPendingSellers = getPendingSellers;
const getSellerForValidation = async (req, res) => {
    try {
        const { id } = req.params;
        const seller = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: Number(id) },
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
        res.json({ ok: true, data: seller });
    }
    catch (error) {
        console.error("Error getSellerForValidation:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getSellerForValidation = getSellerForValidation;
const aprobarVendedor = async (req, res) => {
    try {
        const { id } = req.params;
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: Number(id) },
        });
        if (!perfil) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        await perfil.update({
            estado_validacion: "aprobado",
            observaciones: null,
            actualizado_en: new Date(),
        });
        res.json({ ok: true, message: "Vendedor aprobado correctamente" });
    }
    catch (error) {
        console.error("Error aprobarVendedor:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.aprobarVendedor = aprobarVendedor;
const rechazarVendedor = async (req, res) => {
    try {
        const { id } = req.params;
        const { observaciones } = req.body;
        if (!observaciones) {
            res.status(400).json({
                message: "Debes enviar observaciones al rechazar",
            });
            return;
        }
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: Number(id) },
        });
        if (!perfil) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        await perfil.update({
            estado_validacion: "rechazado",
            observaciones,
            actualizado_en: new Date(),
        });
        res.json({ ok: true, message: "Vendedor rechazado correctamente" });
    }
    catch (error) {
        console.error("Error rechazarVendedor:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.rechazarVendedor = rechazarVendedor;
const getAllTickets = async (req, res) => {
    try {
        const { estado } = req.query;
        const where = {};
        if (estado)
            where.estado = estado;
        const tickets = await ticket_model_1.Ticket.findAll({
            where,
            order: [["createdAt", "DESC"]],
        });
        res.json({ ok: true, data: tickets });
    }
    catch (error) {
        console.error("getAllTickets error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getAllTickets = getAllTickets;
const getTicketDetailAdmin = async (req, res) => {
    try {
        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        const ticketId = Number(id);
        if (Number.isNaN(ticketId)) {
            return res.status(400).json({ message: "ID inválido" });
        }
        const ticket = await ticket_model_1.Ticket.findByPk(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado" });
        }
        const messages = await ticketMessage_model_1.TicketMessage.findAll({
            where: { ticket_id: ticket.id },
            order: [["createdAt", "ASC"]],
        });
        return res.json({
            ok: true,
            data: { ticket, messages },
        });
    }
    catch (error) {
        console.error("getTicketDetailAdmin error:", error);
        return res.status(500).json({ message: "Error interno" });
    }
};
exports.getTicketDetailAdmin = getTicketDetailAdmin;
const assignTicket = async (req, res) => {
    try {
        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        const ticketId = Number(id);
        if (Number.isNaN(ticketId)) {
            return res.status(400).json({ message: "ID inválido" });
        }
        if (!req.user) {
            return res.status(401).json({ message: "No autorizado" });
        }
        const adminId = Number(req.user.id);
        const ticket = await ticket_model_1.Ticket.findByPk(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado" });
        }
        await ticket.update({
            asignado_a: adminId,
            estado: "en_proceso",
        });
        return res.json({
            ok: true,
            message: "Ticket asignado",
        });
    }
    catch (error) {
        console.error("assignTicket error:", error);
        return res.status(500).json({ message: "Error interno" });
    }
};
exports.assignTicket = assignTicket;
const changeTicketStatus = async (req, res) => {
    try {
        const idParam = req.params.id;
        const idRaw = Array.isArray(idParam) ? idParam[0] : idParam;
        const ticketId = Number(idRaw);
        if (!ticketId || Number.isNaN(ticketId)) {
            return res.status(400).json({ message: "ID inválido" });
        }
        const { estado } = req.body;
        const allowedStates = [
            "abierto",
            "en_proceso",
            "esperando_usuario",
            "cerrado",
        ];
        if (!estado || !allowedStates.includes(estado)) {
            return res.status(400).json({ message: "Estado inválido" });
        }
        const ticket = await ticket_model_1.Ticket.findByPk(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado" });
        }
        await ticket.update({
            estado,
            closedAt: estado === "cerrado" ? new Date() : null,
        });
        return res.json({
            ok: true,
            message: "Estado actualizado correctamente",
        });
    }
    catch (error) {
        console.error("changeTicketStatus error:", error);
        return res.status(500).json({ message: "Error interno" });
    }
};
exports.changeTicketStatus = changeTicketStatus;
const replyToTicketAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { mensaje } = req.body;
        const adminId = req.user.id;
        await ticketMessage_model_1.TicketMessage.create({
            ticket_id: Number(id),
            sender_id: Number(adminId),
            mensaje,
            es_admin: true,
        });
        await ticket_model_1.Ticket.update({ estado: "esperando_usuario" }, { where: { id } });
        res.json({ ok: true, message: "Respuesta enviada" });
    }
    catch (error) {
        console.error("replyToTicketAdmin error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.replyToTicketAdmin = replyToTicketAdmin;
const getAllAdminProducts = async (req, res) => {
    try {
        const [productos] = await db_1.sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.activo,
        p.created_at,
        p.vendedor_id,

        u.correo AS vendedor_email,
        s.nombre_comercio,
        s.estado_admin,
        s.estado_validacion,

        COALESCE(pv.total_views, 0) AS total_views,

        CASE
          WHEN p.activo = false THEN 'desactivado'
          WHEN p.vendedor_id IS NULL THEN 'sin_vendedor'
          WHEN s.estado_validacion != 'aprobado' THEN 'pendiente_kyc'
          WHEN s.estado_admin != 'activo' THEN 'bloqueado_seller'
          ELSE 'visible'
        END AS estado_marketplace

      FROM productos p

      LEFT JOIN vendedor_perfil s 
        ON s.user_id = p.vendedor_id

      LEFT JOIN users u
        ON u.id = p.vendedor_id

      LEFT JOIN (
        SELECT product_id, COUNT(*)::int AS total_views
        FROM product_views
        GROUP BY product_id
      ) pv ON pv.product_id = p.id

      ORDER BY p.created_at DESC
    `);
        const enrichedProducts = productos.map((producto) => {
            const createdAt = new Date(producto.created_at).getTime();
            const now = Date.now();
            const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
            let riskScore = 0;
            let riskLevel = "low";
            if (producto.estado_marketplace === "sin_vendedor" ||
                producto.estado_marketplace === "bloqueado_seller" ||
                producto.estado_marketplace === "desactivado" ||
                producto.activo === false ||
                (producto.estado_admin &&
                    producto.estado_admin !== "activo")) {
                riskScore = 90;
                riskLevel = "high";
            }
            else if (producto.total_views === 0 && daysSinceCreation > 30) {
                riskScore = 60;
                riskLevel = "medium";
            }
            else if (producto.total_views === 0 && daysSinceCreation > 14) {
                riskScore = 40;
                riskLevel = "medium";
            }
            else {
                riskScore = 0;
                riskLevel = "low";
            }
            return {
                ...producto,
                risk: {
                    score: riskScore,
                    level: riskLevel,
                },
            };
        });
        res.json({
            success: true,
            data: enrichedProducts,
        });
    }
    catch (error) {
        console.error("Error getAllAdminProducts:", error);
        res.status(500).json({
            success: false,
            message: "Error obteniendo productos admin",
        });
    }
};
exports.getAllAdminProducts = getAllAdminProducts;
const getAdminProductDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const [product] = await db_1.sequelize.query(`
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.activo,
        p.created_at,
        p.vendedor_id,

        s.nombre_comercio,
        s.estado_admin,
        s.estado_validacion,

        u.correo AS vendedor_email,

        CASE
          WHEN p.activo = false THEN 'desactivado'
          WHEN p.vendedor_id IS NULL THEN 'sin_vendedor'
          WHEN s.estado_validacion != 'aprobado' THEN 'pendiente_kyc'
          WHEN s.estado_admin != 'activo' THEN 'bloqueado_seller'
          ELSE 'visible'
        END AS estado_marketplace

      FROM productos p
      LEFT JOIN vendedor_perfil s
        ON s.user_id = p.vendedor_id
      LEFT JOIN users u
        ON u.id = p.vendedor_id
      WHERE p.id = :id
      `, {
            replacements: { id },
        });
        if (!product.length) {
            res.status(404).json({
                success: false,
                message: "Producto no encontrado",
            });
            return;
        }
        const producto = product[0];
        const [imagenes] = await db_1.sequelize.query(`
      SELECT id, url
      FROM producto_imagenes
      WHERE producto_id = :id
      `, {
            replacements: { id },
        });
        const [[viewsTotal]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS total_views
      FROM product_views
      WHERE product_id = :id
      `, { replacements: { id } });
        const [[views7d]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS views_7d
      FROM product_views
      WHERE product_id = :id
      AND created_at >= NOW() - INTERVAL '7 days'
      `, { replacements: { id } });
        const [[views30d]] = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS views_30d
      FROM product_views
      WHERE product_id = :id
      AND created_at >= NOW() - INTERVAL '30 days'
      `, { replacements: { id } });
        const [[lastView]] = await db_1.sequelize.query(`
      SELECT MAX(created_at) AS last_view
      FROM product_views
      WHERE product_id = :id
      `, { replacements: { id } });
        const totalViews = viewsTotal?.total_views ?? 0;
        const viewsLast7d = views7d?.views_7d ?? 0;
        const viewsLast30d = views30d?.views_30d ?? 0;
        const lastViewDate = lastView?.last_view ?? null;
        const isDeadProduct = totalViews === 0 &&
            new Date(producto.created_at).getTime() <
                Date.now() - 14 * 24 * 60 * 60 * 1000;
        const isSuspicious = viewsLast30d > 1000 &&
            producto.estado_marketplace !== "visible";
        let riskScore = 0;
        let riskLevel = "low";
        const createdAt = new Date(producto.created_at).getTime();
        const now = Date.now();
        const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
        if (producto.estado_marketplace === "sin_vendedor" ||
            producto.estado_marketplace === "bloqueado_seller" ||
            producto.activo === false ||
            (producto.estado_admin && producto.estado_admin !== "activo")) {
            riskScore = 90;
            riskLevel = "high";
        }
        else if (totalViews === 0 && daysSinceCreation > 30) {
            riskScore = 60;
            riskLevel = "medium";
        }
        else if (totalViews === 0 && daysSinceCreation > 14) {
            riskScore = 40;
            riskLevel = "medium";
        }
        else {
            riskScore = 0;
            riskLevel = "low";
        }
        res.json({
            success: true,
            data: {
                ...producto,
                imagenes,
                total_views: totalViews,
                views_7d: viewsLast7d,
                views_30d: viewsLast30d,
                last_view: lastViewDate,
                flags: {
                    isDeadProduct,
                    isSuspicious,
                },
                risk: {
                    score: riskScore,
                    level: riskLevel,
                },
            },
        });
    }
    catch (error) {
        console.error("Error getAdminProductDetail:", error);
        res.status(500).json({
            success: false,
            message: "Error obteniendo detalle admin del producto",
        });
    }
};
exports.getAdminProductDetail = getAdminProductDetail;
const reviewSellerKYC = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const adminId = Number(req.user.id);
        const { dpi_legible, selfie_coincide, datos_coinciden, comercio_legitimo, ubicacion_coherente, notas_internas, } = req.body;
        const seller = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: userId },
        });
        if (!seller) {
            res.status(404).json({
                message: "Vendedor no encontrado",
            });
            return;
        }
        const checklist = {
            dpi_legible: Boolean(dpi_legible),
            selfie_coincide: Boolean(selfie_coincide),
            datos_coinciden: Boolean(datos_coinciden),
            comercio_legitimo: Boolean(comercio_legitimo),
            ubicacion_coherente: Boolean(ubicacion_coherente),
        };
        const totalChecks = Object.values(checklist).filter(Boolean).length;
        const score = Math.round((totalChecks / 5) * 100);
        let riesgo = "medio";
        if (score >= 80)
            riesgo = "bajo";
        else if (score >= 50)
            riesgo = "medio";
        else
            riesgo = "alto";
        const before = {
            kyc_score: seller.kyc_score,
            kyc_riesgo: seller.kyc_riesgo,
        };
        seller.kyc_checklist = checklist;
        seller.kyc_score = score;
        seller.kyc_riesgo = riesgo;
        seller.kyc_revisado_por = adminId;
        seller.kyc_revisado_en = new Date();
        seller.notas_internas = notas_internas ?? null;
        await seller.save();
        await (0, logAdminEvent_1.logAdminEvent)({
            entityType: "seller",
            entityId: seller.user_id,
            action: "KYC_REVIEWED",
            performedBy: adminId,
            metadata: {
                before,
                after: {
                    kyc_score: score,
                    kyc_riesgo: riesgo,
                },
                checklist,
            },
        });
        res.json({
            success: true,
            message: "Revisión KYC guardada correctamente",
            score,
            riesgo,
        });
    }
    catch (error) {
        console.error("reviewSellerKYC error:", error);
        res.status(500).json({
            message: "Error al revisar KYC",
        });
    }
};
exports.reviewSellerKYC = reviewSellerKYC;
