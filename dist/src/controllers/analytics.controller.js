"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerAnalyticsOverview = exports.endProductSession = exports.startProductSession = exports.trackSellerView = exports.trackProductView = exports.getTopViewedProducts = void 0;
const db_1 = require("../config/db");
const sequelize_1 = require("sequelize");
const uuid_1 = require("uuid");
const analytics_service_1 = require("../services/analytics.service");
function ensureSession(req) {
    if (!req.session)
        return;
    req.session._analytics = req.session._analytics || true;
}
const getTopViewedProducts = async (_req, res) => {
    try {
        const rows = await db_1.sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        COUNT(pv.id)::int AS total_views
      FROM productos p
      JOIN product_views pv ON pv.product_id = p.id
      GROUP BY p.id, p.nombre
      ORDER BY total_views DESC
      LIMIT 10
      `, { type: sequelize_1.QueryTypes.SELECT });
        res.json({ success: true, data: rows });
    }
    catch (error) {
        console.error("Error getTopViewedProducts:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getTopViewedProducts = getTopViewedProducts;
const trackProductView = async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            res.status(400).json({ message: "productId requerido" });
            return;
        }
        ensureSession(req);
        const sessionId = req.sessionID;
        const ip = req.ip;
        const userAgent = req.headers["user-agent"] || null;
        const product = await db_1.sequelize.query(`SELECT vendedor_id FROM productos WHERE id = :id`, {
            replacements: { id: productId },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!product.length) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        const sellerId = product[0].vendedor_id;
        const result = await db_1.sequelize.query(`
      INSERT INTO product_views (
        product_id,
        seller_id,
        session_id,
        viewed_at,
        view_date,
        ip_address,
        user_agent
      )
      SELECT
        :product_id,
        :seller_id,
        :session_id,
        NOW(),
        CURRENT_DATE,
        :ip_address,
        :user_agent
      WHERE NOT EXISTS (
        SELECT 1 FROM product_views
        WHERE product_id = :product_id
        AND session_id = :session_id
        AND viewed_at > NOW() - INTERVAL '10 minutes'
      )
      `, {
            replacements: {
                product_id: productId,
                seller_id: sellerId,
                session_id: sessionId,
                ip_address: ip,
                user_agent: userAgent,
            },
        });
        const rows = result?.[0];
        if (!rows || rows.length === 0) {
            res.json({ success: true, deduped: true });
            return;
        }
        res.json({ success: true, inserted: true });
    }
    catch (error) {
        console.error("Error trackProductView:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.trackProductView = trackProductView;
const trackSellerView = async (req, res) => {
    try {
        const { sellerId } = req.params;
        if (!sellerId) {
            res.status(400).json({ message: "sellerId requerido" });
            return;
        }
        ensureSession(req);
        const sessionId = req.sessionID;
        const ip = req.ip;
        const userAgent = req.headers["user-agent"] || null;
        await db_1.sequelize.query(`
      INSERT INTO seller_views (
        seller_id,
        session_id,
        viewed_at,
        view_date,
        ip_address,
        user_agent
      )
      SELECT
        :seller_id,
        :session_id,
        NOW(),
        CURRENT_DATE,
        :ip_address,
        :user_agent
      WHERE NOT EXISTS (
        SELECT 1 FROM seller_views
        WHERE seller_id = :seller_id
        AND session_id = :session_id
        AND viewed_at > NOW() - INTERVAL '10 minutes'
      )
      `, {
            replacements: {
                seller_id: Number(sellerId),
                session_id: sessionId,
                ip_address: ip,
                user_agent: userAgent,
            },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error trackSellerView:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.trackSellerView = trackSellerView;
const startProductSession = async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) {
            res.status(400).json({ message: "productId requerido" });
            return;
        }
        const product = await db_1.sequelize.query(`
      SELECT p.id, p.vendedor_id
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.id = :productId
        AND p.activo = true
        AND v.estado_validacion = 'aprobado'
      `, {
            replacements: { productId },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!product.length) {
            res.status(404).json({ message: "Producto no disponible" });
            return;
        }
        const sessionId = (0, uuid_1.v4)();
        await db_1.sequelize.query(`
      INSERT INTO product_sessions (
        product_id,
        vendedor_id,
        session_id,
        duration_seconds,
        created_at
      )
      VALUES (
        :product_id,
        :vendedor_id,
        :session_id,
        NULL,
        NOW()
      )
      `, {
            replacements: {
                product_id: productId,
                vendedor_id: product[0].vendedor_id,
                session_id: sessionId,
            },
        });
        res.json({ success: true, sessionId });
    }
    catch (error) {
        console.error("Error startProductSession:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.startProductSession = startProductSession;
const endProductSession = async (req, res) => {
    try {
        const { sessionId, duration } = req.body;
        if (!sessionId) {
            res.status(400).json({ message: "sessionId requerido" });
            return;
        }
        const durationNumber = Number(duration);
        if (!Number.isFinite(durationNumber)) {
            res.status(400).json({ message: "Duración inválida" });
            return;
        }
        if (durationNumber < 3) {
            res.json({ success: true, ignored: true });
            return;
        }
        await db_1.sequelize.query(`
      UPDATE product_sessions
      SET duration_seconds = :duration
      WHERE session_id = :session_id
      `, {
            replacements: {
                duration: durationNumber,
                session_id: sessionId,
            },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error endProductSession:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.endProductSession = endProductSession;
const getSellerAnalyticsOverview = async (req, res) => {
    try {
        const sellerId = req.user?.id;
        if (!sellerId) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const data = await (0, analytics_service_1.getSellerAnalyticsData)(Number(sellerId));
        res.json({
            success: true,
            totalProductViews: data.totalProductViews,
            totalProfileViews: data.totalProfileViews,
            topProducts: data.topProducts,
            last30Days: data.last30Days,
        });
    }
    catch (error) {
        console.error("Error getSellerAnalyticsOverview:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
};
exports.getSellerAnalyticsOverview = getSellerAnalyticsOverview;
