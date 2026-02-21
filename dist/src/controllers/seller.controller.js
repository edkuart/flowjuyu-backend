"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerAnalyticsDaily = exports.getSellerAnalytics = exports.getSellerAccountStatus = exports.getPublicSellerStore = exports.getTopSellers = exports.getSellers = exports.validateSellerBusiness = exports.updateSellerProfile = exports.getSellerProfile = exports.getSellerProducts = exports.getSellerOrders = exports.getSellerKpis = exports.getSellerDashboard = void 0;
const VendedorPerfil_1 = require("../models/VendedorPerfil");
const sequelize_1 = require("sequelize");
const user_model_1 = require("../models/user.model");
const db_1 = require("../config/db");
const supabase_1 = __importDefault(require("../lib/supabase"));
const uuid_1 = require("uuid");
const getSellerDashboard = async (req, res) => {
    try {
        const user = req.user;
        if (!user || (user.rol !== "seller" && user.rol !== "vendedor")) {
            res.status(403).json({ message: "No autorizado" });
            return;
        }
        const vendedorId = user.id;
        const [productoStats] = await db_1.sequelize.query(`
      SELECT
        COUNT(*)::int AS total_productos,
        COUNT(*) FILTER (WHERE activo = true)::int AS activos,
        COUNT(*) FILTER (WHERE activo = false)::int AS inactivos,
        COUNT(*) FILTER (WHERE stock < 5 AND activo = true)::int AS stock_bajo
      FROM productos
      WHERE vendedor_id = :vid
      `, {
            replacements: { vid: vendedorId },
            type: sequelize_1.QueryTypes.SELECT,
        });
        const kpi = {
            ventasMes: 0,
            pedidosMes: 0,
            ticketPromedio: 0,
            productosActivos: productoStats.activos ?? 0,
        };
        res.json({
            kpi,
            productoStats: {
                total: productoStats.total_productos ?? 0,
                activos: productoStats.activos ?? 0,
                inactivos: productoStats.inactivos ?? 0,
                stock_bajo: productoStats.stock_bajo ?? 0,
            },
            ventasPorMes: [],
            topCategorias: [],
            actividad: [],
            lowStock: [],
            validaciones: [],
        });
    }
    catch (error) {
        console.error("Error en getSellerDashboard:", error);
        res.status(500).json({
            message: "Error al cargar el dashboard del vendedor",
        });
    }
};
exports.getSellerDashboard = getSellerDashboard;
const getSellerKpis = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const [ventas] = await db_1.sequelize.query(`
      SELECT 
        COALESCE(SUM(total), 0) AS ventasMes,
        COUNT(*) AS pedidosMes
      FROM pedidos
      WHERE vendedor_id = :vid
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `, { replacements: { vid: user.id } });
        const ventasMes = Number(ventas[0]?.ventasmes ?? 0);
        const pedidosMes = Number(ventas[0]?.pedidosmes ?? 0);
        res.json({
            ventasMes,
            pedidosMes,
            ticketPromedio: pedidosMes ? ventasMes / pedidosMes : 0,
            productosActivos: 0,
        });
    }
    catch (e) {
        console.error("Error KPIs:", e);
        res.status(500).json({ message: "Error al obtener KPIs" });
    }
};
exports.getSellerKpis = getSellerKpis;
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
const getSellerProducts = async (req, res) => {
    try {
        const u = req.user;
        if (!u?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: u.id }
        });
        if (!perfil) {
            res.status(404).json({
                message: "Perfil vendedor no encontrado"
            });
            return;
        }
        const rows = await db_1.sequelize.query(`
      SELECT id, nombre, precio, stock, activo, imagen_url
      FROM productos
      WHERE vendedor_id = :vid
      ORDER BY created_at DESC
      `, {
            replacements: { vid: perfil.user_id },
            type: sequelize_1.QueryTypes.SELECT
        });
        res.json(rows);
    }
    catch (e) {
        console.error("❌ Error en getSellerProducts:", e);
        res.status(500).json({
            message: "Error al obtener productos",
            error: e.message
        });
    }
};
exports.getSellerProducts = getSellerProducts;
const getSellerProfile = async (req, res) => {
    try {
        const user = req.user || null;
        const { id } = req.params;
        if (id && isNaN(Number(id))) {
            res
                .status(400)
                .json({ ok: false, message: "El parámetro 'id' debe ser numérico" });
            return;
        }
        const targetId = id || user?.id;
        if (!targetId) {
            res
                .status(401)
                .json({ ok: false, message: "Usuario no autenticado" });
            return;
        }
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: targetId },
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
        const ratingRows = await db_1.sequelize.query(`
      SELECT 
        COUNT(r.id) AS rating_count,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg
      FROM productos p
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.vendedor_id = :sellerId
      `, {
            replacements: { sellerId: perfil.user_id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        const ratingData = ratingRows[0] || {
            rating_avg: 0,
            rating_count: 0,
        };
        const esPropietario = Number(user?.id) === Number(perfil.user_id);
        const forcePublic = req.query.preview === "true";
        if (!esPropietario || forcePublic) {
            res.json({
                id: perfil.id,
                nombre_comercio: perfil.nombre_comercio,
                descripcion: perfil.descripcion,
                logo: perfil.logo,
                departamento: perfil.departamento,
                municipio: perfil.municipio,
                rating_avg: Number(ratingData.rating_avg),
                rating_count: Number(ratingData.rating_count),
            });
            return;
        }
        res.json({
            ...perfil.toJSON(),
            rating_avg: Number(ratingData.rating_avg),
            rating_count: Number(ratingData.rating_count),
        });
    }
    catch (error) {
        console.error("Error en getSellerProfile:", error);
        res
            .status(500)
            .json({ ok: false, message: "Error al obtener perfil" });
    }
};
exports.getSellerProfile = getSellerProfile;
const updateSellerProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ ok: false, message: "No autorizado" });
            return;
        }
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({ where: { user_id: user.id } });
        if (!perfil) {
            res.status(404).json({ ok: false, message: "Perfil no encontrado" });
            return;
        }
        let logoUrl = perfil.logo;
        if (req.body.logo === null || req.body.logo === "null") {
            if (perfil.logo) {
                const prevFile = perfil.logo.split("/").pop();
                if (prevFile) {
                    await supabase_1.default.storage.from("logos_comercios")
                        .remove([`vendedores/${prevFile}`]);
                }
            }
            logoUrl = null;
        }
        if (req.file) {
            if (perfil.logo) {
                const prevFile = perfil.logo.split("/").pop();
                if (prevFile) {
                    await supabase_1.default.storage.from("logos_comercios").remove([`vendedores/${prevFile}`]);
                }
            }
            const ext = req.file.originalname.split(".").pop();
            const fileName = `vendedores/${(0, uuid_1.v4)()}.${ext}`;
            const { error: uploadError } = await supabase_1.default.storage
                .from("logos_comercios")
                .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
            if (uploadError)
                throw uploadError;
            const { data: publicUrl } = supabase_1.default.storage
                .from("logos_comercios")
                .getPublicUrl(fileName);
            logoUrl = publicUrl.publicUrl;
        }
        const fieldsToUpdate = {
            nombre_comercio: req.body.nombre_comercio ?? perfil.nombre_comercio,
            descripcion: req.body.descripcion ?? perfil.descripcion,
            telefono_comercio: req.body.telefono_comercio ?? perfil.telefono_comercio,
            direccion: req.body.direccion ?? perfil.direccion,
            departamento: req.body.departamento ?? perfil.departamento,
            municipio: req.body.municipio ?? perfil.municipio,
            logo: logoUrl,
            updatedAt: new Date(),
        };
        await VendedorPerfil_1.VendedorPerfil.update(fieldsToUpdate, { where: { user_id: user.id } });
        const updatedPerfil = await VendedorPerfil_1.VendedorPerfil.findOne({ where: { user_id: user.id } });
        res.json({
            ok: true,
            message: "Perfil actualizado correctamente",
            perfil: updatedPerfil,
        });
    }
    catch (error) {
        console.error("❌ Error en updateSellerProfile:", error);
        res.status(500).json({
            ok: false,
            message: "Error al actualizar perfil",
            error: error.message,
        });
    }
};
exports.updateSellerProfile = updateSellerProfile;
const validateSellerBusiness = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
            where: { user_id: user.id },
        });
        if (!perfil) {
            res.status(404).json({ message: "Perfil no encontrado" });
            return;
        }
        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            res.status(400).json({ message: "Debes subir al menos un documento" });
            return;
        }
        const updateFields = {};
        const uploadToSupabase = async (file, folder) => {
            const ext = file.originalname.split(".").pop();
            const fileName = `${folder}/${(0, uuid_1.v4)()}.${ext}`;
            const { error } = await supabase_1.default.storage
                .from("documentos_vendedores")
                .upload(fileName, file.buffer, {
                contentType: file.mimetype,
            });
            if (error)
                throw error;
            const { data } = supabase_1.default.storage
                .from("documentos_vendedores")
                .getPublicUrl(fileName);
            return data.publicUrl;
        };
        if (files.foto_dpi_frente) {
            updateFields.foto_dpi_frente = await uploadToSupabase(files.foto_dpi_frente[0], "dpi_frente");
        }
        if (files.foto_dpi_reverso) {
            updateFields.foto_dpi_reverso = await uploadToSupabase(files.foto_dpi_reverso[0], "dpi_reverso");
        }
        if (files.selfie_con_dpi) {
            updateFields.selfie_con_dpi = await uploadToSupabase(files.selfie_con_dpi[0], "selfie");
        }
        updateFields.estado_validacion = "en_revision";
        updateFields.observaciones = null;
        updateFields.actualizado_en = new Date();
        await VendedorPerfil_1.VendedorPerfil.update(updateFields, {
            where: { user_id: user.id },
        });
        res.json({
            ok: true,
            message: "Documentos enviados correctamente. Están en revisión.",
        });
    }
    catch (error) {
        console.error("Error en validateSellerBusiness:", error);
        res.status(500).json({
            message: "Error al enviar documentos",
            error: error.message,
        });
    }
};
exports.validateSellerBusiness = validateSellerBusiness;
const getSellers = async (_req, res) => {
    try {
        const [rows] = await db_1.sequelize.query(`
      SELECT 
        user_id AS id,
        COALESCE(nombre_comercio, nombre, 'Tienda sin nombre') AS nombre,
        logo AS logo_url,
        descripcion,
        departamento,
        municipio,
        "createdAt"
      FROM vendedor_perfil
      WHERE estado_admin = 'activo'
      AND estado_validacion = 'aprobado'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);
        res.json(rows ?? []);
    }
    catch (error) {
        console.error("Error al obtener tiendas:", error);
        res.status(500).json({ message: "Error al obtener tiendas", error: error.message });
    }
};
exports.getSellers = getSellers;
const getTopSellers = async (req, res) => {
    try {
        const sellers = await db_1.sequelize.query(`
      SELECT
        vp.user_id AS vendedor_id,
        vp.nombre_comercio,
        vp.logo,
        COUNT(r.id) AS total_reviews,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
        (
          (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
          +
          (5.0 / (COUNT(r.id) + 5)) * 3.5
        ) AS weighted_score
      FROM vendedor_perfil vp
      LEFT JOIN productos p ON p.vendedor_id = vp.user_id
      LEFT JOIN reviews r ON r.producto_id = p.id
      GROUP BY vp.user_id, vp.nombre_comercio, vp.logo
      ORDER BY weighted_score DESC NULLS LAST
      `, { type: sequelize_1.QueryTypes.SELECT });
        const normalized = sellers.map((s) => ({
            id: Number(s.vendedor_id),
            nombre_comercio: s.nombre_comercio,
            logo_url: s.logo,
            total_reviews: Number(s.total_reviews),
            rating_avg: Number(Number(s.rating_avg).toFixed(2)),
            weighted_score: Number(Number(s.weighted_score).toFixed(3)),
        }));
        res.json({
            success: true,
            data: normalized,
        });
    }
    catch (error) {
        console.error("Error obteniendo top sellers:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getTopSellers = getTopSellers;
const getPublicSellerStore = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) {
            res.status(400).json({ message: "ID inválido" });
            return;
        }
        const seller = await db_1.sequelize.query(`
      SELECT 
        vp.user_id AS id,
        vp.nombre_comercio,
        vp.descripcion,
        vp.logo,
        vp.departamento,
        vp.municipio
      FROM vendedor_perfil vp
      WHERE vp.user_id = :id
      `, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!seller || seller.length === 0) {
            res.status(404).json({ message: "Vendedor no encontrado" });
            return;
        }
        const sellerData = seller[0];
        const products = await db_1.sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio
      FROM productos p
      WHERE p.vendedor_id = :id
      AND p.activo = true
      ORDER BY p.created_at DESC
      `, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        const rating = await db_1.sequelize.query(`
      SELECT 
        COUNT(r.id) AS rating_count,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg
      FROM productos p
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.vendedor_id = :id
      `, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        const ratingData = rating[0];
        res.json({
            seller: {
                ...sellerData,
                rating_avg: Number(ratingData.rating_avg),
                rating_count: Number(ratingData.rating_count),
            },
            products: products ?? [],
            stats: {
                total_products: products.length,
                total_reviews: Number(ratingData.rating_count),
            },
        });
    }
    catch (error) {
        console.error("Error en getPublicSellerStore:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getPublicSellerStore = getPublicSellerStore;
const getSellerAccountStatus = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ ok: false, message: "No autenticado" });
            return;
        }
        const [rows] = await db_1.sequelize.query(`
      SELECT
        estado_validacion,
        observaciones,
        actualizado_en,
        foto_dpi_frente,
        foto_dpi_reverso,
        selfie_con_dpi
      FROM vendedor_perfil
      WHERE user_id = :user_id
      `, {
            replacements: { user_id: userId },
        });
        if (!rows.length) {
            res.status(404).json({ ok: false, message: "Perfil no encontrado" });
            return;
        }
        const perfil = rows[0];
        const puedeOperar = perfil.estado === "activo" &&
            perfil.estado_validacion === "aprobado";
        res.json({
            ok: true,
            data: {
                estado_validacion: perfil.estado_validacion,
                estado_admin: perfil.estado,
                ultima_revision: perfil.actualizado_en,
                observaciones_generales: perfil.observaciones,
                documentos: {
                    dpi_frente: { subido: !!perfil.foto_dpi_frente },
                    dpi_reverso: { subido: !!perfil.foto_dpi_reverso },
                    selfie_con_dpi: { subido: !!perfil.selfie_con_dpi },
                },
                puede_publicar: puedeOperar,
                visible_publicamente: puedeOperar,
                puede_operar: puedeOperar,
            },
        });
    }
    catch (error) {
        console.error("Error getSellerAccountStatus:", error);
        res.status(500).json({ ok: false, message: "Error interno del servidor" });
    }
};
exports.getSellerAccountStatus = getSellerAccountStatus;
const getSellerAnalytics = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const sellerId = user.id;
        const productViews = await db_1.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM product_views
      WHERE seller_id = :sellerId
      `, {
            replacements: { sellerId },
            type: sequelize_1.QueryTypes.SELECT,
        });
        let totalProfileViews = 0;
        try {
            const profileViews = await db_1.sequelize.query(`
        SELECT COUNT(*)::int AS total
        FROM seller_views
        WHERE seller_id = :sellerId
        `, {
                replacements: { sellerId },
                type: sequelize_1.QueryTypes.SELECT,
            });
            totalProfileViews = profileViews[0]?.total ?? 0;
        }
        catch (e) {
            totalProfileViews = 0;
        }
        const topProducts = await db_1.sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        COUNT(pv.id)::int AS total_views
      FROM productos p
      LEFT JOIN product_views pv ON pv.product_id = p.id
      WHERE p.vendedor_id = :sellerId
      GROUP BY p.id
      ORDER BY total_views DESC
      LIMIT 5
      `, {
            replacements: { sellerId },
            type: sequelize_1.QueryTypes.SELECT,
        });
        res.json({
            success: true,
            totalProductViews: productViews[0]?.total ?? 0,
            totalProfileViews,
            topProducts,
        });
    }
    catch (error) {
        console.error("Error getSellerAnalytics:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.getSellerAnalytics = getSellerAnalytics;
const getSellerAnalyticsDaily = async (req, res) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const sellerId = Number(user.id);
        if (!Number.isFinite(sellerId)) {
            res.status(400).json({ message: "sellerId inválido" });
            return;
        }
        const days = 30;
        const productDaily = await db_1.sequelize.query(`
      WITH date_range AS (
        SELECT (CURRENT_DATE - (gs || ' days')::interval)::date AS day
        FROM generate_series(:daysMinus1, 0, -1) gs
      )
      SELECT
        dr.day::text AS date,
        COALESCE(pv.cnt, 0)::int AS product_views
      FROM date_range dr
      LEFT JOIN (
        SELECT view_date AS day, COUNT(*)::int AS cnt
        FROM product_views
        WHERE seller_id = :sellerId
          AND view_date >= (CURRENT_DATE - (:daysMinus1 || ' days')::interval)::date
        GROUP BY view_date
      ) pv ON pv.day = dr.day
      ORDER BY dr.day ASC
      `, {
            replacements: {
                sellerId,
                daysMinus1: days - 1,
            },
            type: sequelize_1.QueryTypes.SELECT,
        });
        let profileDaily = [];
        try {
            profileDaily = await db_1.sequelize.query(`
        WITH date_range AS (
          SELECT (CURRENT_DATE - (gs || ' days')::interval)::date AS day
          FROM generate_series(:daysMinus1, 0, -1) gs
        )
        SELECT
          dr.day::text AS date,
          COALESCE(sv.cnt, 0)::int AS profile_views
        FROM date_range dr
        LEFT JOIN (
          SELECT view_date AS day, COUNT(*)::int AS cnt
          FROM seller_views
          WHERE seller_id = :sellerId
            AND view_date >= (CURRENT_DATE - (:daysMinus1 || ' days')::interval)::date
          GROUP BY view_date
        ) sv ON sv.day = dr.day
        ORDER BY dr.day ASC
        `, {
                replacements: {
                    sellerId,
                    daysMinus1: days - 1,
                },
                type: sequelize_1.QueryTypes.SELECT,
            });
        }
        catch {
            profileDaily = productDaily.map((r) => ({
                date: r.date,
                profile_views: 0,
            }));
        }
        const merged = productDaily.map((p) => {
            const s = profileDaily.find((x) => x.date === p.date);
            return {
                date: p.date,
                product_views: p.product_views ?? 0,
                profile_views: s?.profile_views ?? 0,
            };
        });
        res.json({
            success: true,
            days,
            data: merged,
        });
    }
    catch (error) {
        console.error("Error getSellerAnalyticsDaily:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.getSellerAnalyticsDaily = getSellerAnalyticsDaily;
