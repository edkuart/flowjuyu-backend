"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrendingProducts = exports.getTopProductsByCategory = exports.createProductReview = exports.getProductReviews = exports.getFilters = exports.getFilteredProducts = exports.getNewProducts = exports.getProductsByCategory = exports.toggleProductActive = exports.deleteProduct = exports.setPrincipalImage = exports.updateProduct = exports.getProductById = exports.getSellerProducts = exports.createProduct = exports.getAccesorioMateriales = exports.getAccesorioTipos = exports.getAccesorios = exports.deleteProductImage = exports.getProductForEdit = exports.getTelas = exports.getRegiones = exports.getClases = exports.getCategorias = exports.uploadProductImages = void 0;
const db_1 = require("../config/db");
const multer_1 = __importDefault(require("multer"));
const supabase_1 = __importDefault(require("../lib/supabase"));
const uuid_1 = require("uuid");
const sequelize_1 = require("sequelize");
const buildPublicProductDTO_1 = require("../utils/buildPublicProductDTO");
const buildPublicProductCardDTO_1 = require("../utils/buildPublicProductCardDTO");
const buildSearchProductDTO_1 = require("../utils/buildSearchProductDTO");
const eventLogger_1 = require("../utils/eventLogger");
const toIntOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const storage = multer_1.default.memoryStorage();
const fileFilter = (_req, file, cb) => /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Solo imágenes permitidas"));
exports.uploadProductImages = (0, multer_1.default)({
    storage,
    limits: { files: 5, fileSize: 5 * 1024 * 1024 },
    fileFilter,
});
const getCategorias = async (_req, res) => {
    try {
        const [rows] = await db_1.sequelize.query(`
      SELECT id, nombre, imagen_url
      FROM categorias
      ORDER BY nombre ASC
    `);
        res.json(rows);
    }
    catch (error) {
        console.error("🔥 ERROR TRENDING:");
        console.error(error);
        console.error(error?.message);
        console.error(error?.parent);
        res.status(500).json({ message: error?.message || "Error interno" });
    }
};
exports.getCategorias = getCategorias;
const getClases = async (_req, res) => {
    try {
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre, alias FROM clases ORDER BY nombre ASC`);
        res.json(rows);
    }
    catch (error) {
        console.error("Error al obtener clases:", error);
        res.status(500).json({ message: "Error al obtener clases" });
    }
};
exports.getClases = getClases;
const getRegiones = async (_req, res) => {
    try {
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM regiones ORDER BY nombre ASC`);
        res.json(rows);
    }
    catch (error) {
        console.error("Error al obtener regiones:", error);
        res.status(500).json({ message: "Error al obtener regiones" });
    }
};
exports.getRegiones = getRegiones;
const getTelas = async (req, res) => {
    const claseId = Number(req.query.clase_id);
    if (!claseId) {
        res.status(400).json({ message: "clase_id requerido" });
        return;
    }
    try {
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM telas WHERE clase_id = :claseId ORDER BY nombre ASC`, { replacements: { claseId } });
        res.json(rows);
    }
    catch (error) {
        console.error("Error al obtener telas:", error);
        res.status(500).json({ message: "Error al obtener telas" });
    }
};
exports.getTelas = getTelas;
const getProductForEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const u = req.user;
        const query = `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.activo,
        p.categoria_id,
        p.categoria_custom,
        p.clase_id,
        p.tela_id,
        p.tela_custom,
        p.departamento,
        p.municipio,
        p.departamento_custom,
        p.municipio_custom,
        p.accesorio_id,
        p.accesorio_custom,
        p.accesorio_tipo_id,
        p.accesorio_tipo_custom,
        p.accesorio_material_id,
        p.accesorio_material_custom,
        p.imagen_url AS imagen_principal,
        p.created_at,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pi.id,
              'url', pi.url
            )
          ) FILTER (WHERE pi.id IS NOT NULL),
          '[]'
        ) AS imagenes

      FROM productos p
      LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id
      WHERE p.id = :id AND p.vendedor_id = :vid
      GROUP BY p.id
      LIMIT 1
    `;
        const rows = await db_1.sequelize.query(query, {
            replacements: { id, vid: u.id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        res.json({ product: rows[0] });
        return;
    }
    catch (error) {
        console.error("Error getProductForEdit:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.getProductForEdit = getProductForEdit;
const deleteProductImage = async (req, res) => {
    try {
        const u = req.user;
        const { id, imageId } = req.params;
        const [rows] = await db_1.sequelize.query(`
      SELECT pi.id, pi.url
      FROM producto_imagenes pi
      JOIN productos p ON p.id = pi.producto_id
      WHERE pi.id = :imageId
        AND p.id = :productId
        AND p.vendedor_id = :vid
      `, {
            replacements: {
                imageId,
                productId: id,
                vid: u.id,
            },
        });
        if (!rows.length) {
            res.status(404).json({ message: "Imagen no encontrada" });
            return;
        }
        const image = rows[0];
        const filePath = image.url.split("/productos/")[1];
        if (filePath) {
            await supabase_1.default.storage
                .from("productos")
                .remove([`products/${filePath}`]);
        }
        await db_1.sequelize.query(`DELETE FROM producto_imagenes WHERE id = :imageId`, { replacements: { imageId } });
        res.json({ message: "Imagen eliminada" });
        return;
    }
    catch (error) {
        console.error("Error deleteProductImage:", error);
        res.status(500).json({ message: "Error al eliminar imagen" });
        return;
    }
};
exports.deleteProductImage = deleteProductImage;
const getAccesorios = async (req, res) => {
    try {
        const tipo = req.query.tipo || "normal";
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre, categoria_tipo
       FROM accesorios
       WHERE categoria_tipo = :tipo
       ORDER BY nombre ASC`, { replacements: { tipo } });
        res.json(rows);
    }
    catch (error) {
        console.error("Error en getAccesorios:", error);
        res.status(500).json({ message: "Error al obtener accesorios" });
    }
};
exports.getAccesorios = getAccesorios;
const getAccesorioTipos = async (req, res) => {
    const accesorioId = Number(req.query.accesorio_id);
    if (!accesorioId) {
        res.status(400).json({ message: "accesorio_id requerido" });
        return;
    }
    try {
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM accesorio_tipos WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`, { replacements: { accesorioId } });
        res.json(rows);
    }
    catch (error) {
        console.error("Error al obtener tipos de accesorio:", error);
        res.status(500).json({ message: "Error al obtener tipos de accesorio" });
    }
};
exports.getAccesorioTipos = getAccesorioTipos;
const getAccesorioMateriales = async (req, res) => {
    const accesorioId = Number(req.query.accesorio_id);
    if (!accesorioId) {
        res.status(400).json({ message: "accesorio_id requerido" });
        return;
    }
    try {
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM accesorio_materiales WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`, { replacements: { accesorioId } });
        res.json(rows);
    }
    catch (error) {
        console.error("Error al obtener materiales de accesorio:", error);
        res
            .status(500)
            .json({ message: "Error al obtener materiales de accesorio" });
    }
};
exports.getAccesorioMateriales = getAccesorioMateriales;
const createProduct = async (req, res) => {
    const t = await db_1.sequelize.transaction();
    const uploadedFiles = [];
    try {
        const u = req.user;
        const b = req.body;
        if (!u?.id) {
            await t.rollback();
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        if (!b.nombre || b.precio === undefined || b.stock === undefined) {
            await t.rollback();
            res.status(400).json({ message: "Campos obligatorios faltantes" });
            return;
        }
        if (!b.clase_id) {
            await t.rollback();
            res.status(400).json({ message: "clase_id es obligatorio" });
            return;
        }
        const precio = Number(b.precio);
        const stock = Number(b.stock);
        if (!Number.isFinite(precio) || precio <= 0) {
            await t.rollback();
            res.status(400).json({ message: "Precio inválido" });
            return;
        }
        if (!Number.isInteger(stock) || stock < 0) {
            await t.rollback();
            res.status(400).json({ message: "Stock inválido" });
            return;
        }
        if ((!b.categoria_id || b.categoria_id === "") &&
            (!b.categoria_custom || String(b.categoria_custom).trim() === "")) {
            await t.rollback();
            res.status(400).json({
                message: "Debe seleccionar una categoría o ingresar una personalizada",
            });
            return;
        }
        const files = req.files || [];
        const urls = [];
        for (const f of files) {
            const filename = `products/${Date.now()}-${Math.round(Math.random() * 1e9)}-${f.originalname}`;
            const { error } = await supabase_1.default.storage
                .from("productos")
                .upload(filename, f.buffer, { contentType: f.mimetype });
            if (error)
                throw error;
            uploadedFiles.push(filename);
            const { data } = supabase_1.default.storage
                .from("productos")
                .getPublicUrl(filename);
            urls.push(data.publicUrl);
        }
        const imagenPrincipal = urls[0] ?? null;
        const galeria = urls.slice(1, 5);
        const [inserted] = await db_1.sequelize.query(`
      INSERT INTO productos (
        vendedor_id, nombre, descripcion, precio, stock,
        categoria_id, categoria_custom,
        clase_id, tela_id, tela_custom,
        departamento, municipio, departamento_custom, municipio_custom,
        accesorio_id, accesorio_custom,
        accesorio_tipo_id, accesorio_tipo_custom,
        accesorio_material_id, accesorio_material_custom,
        imagen_url, activo, created_at, updated_at
      ) VALUES (
        :vendedor_id, :nombre, :descripcion, :precio, :stock,
        :categoria_id, :categoria_custom,
        :clase_id, :tela_id, :tela_custom,
        :departamento, :municipio, :departamento_custom, :municipio_custom,
        :accesorio_id, :accesorio_custom,
        :accesorio_tipo_id, :accesorio_tipo_custom,
        :accesorio_material_id, :accesorio_material_custom,
        :imagen_url, :activo, now(), now()
      ) RETURNING id
      `, {
            transaction: t,
            replacements: {
                vendedor_id: u.id,
                nombre: b.nombre,
                descripcion: b.descripcion || null,
                precio,
                stock,
                categoria_id: b.categoria_id !== undefined && b.categoria_id !== null && b.categoria_id !== ""
                    ? Number(b.categoria_id)
                    : null,
                categoria_custom: b.categoria_custom || null,
                clase_id: b.clase_id !== undefined && b.clase_id !== null && b.clase_id !== ""
                    ? Number(b.clase_id)
                    : null,
                tela_id: b.tela_id !== undefined && b.tela_id !== null && b.tela_id !== ""
                    ? Number(b.tela_id)
                    : null,
                tela_custom: b.tela_custom || null,
                departamento: b.departamento || null,
                municipio: b.municipio || null,
                departamento_custom: b.departamento_custom || null,
                municipio_custom: b.municipio_custom || null,
                accesorio_id: b.accesorio_id !== undefined && b.accesorio_id !== null && b.accesorio_id !== ""
                    ? Number(b.accesorio_id)
                    : null,
                accesorio_custom: b.accesorio_custom || null,
                accesorio_tipo_id: b.accesorio_tipo_id !== undefined &&
                    b.accesorio_tipo_id !== null &&
                    b.accesorio_tipo_id !== ""
                    ? Number(b.accesorio_tipo_id)
                    : null,
                accesorio_tipo_custom: b.accesorio_tipo_custom || null,
                accesorio_material_id: b.accesorio_material_id !== undefined &&
                    b.accesorio_material_id !== null &&
                    b.accesorio_material_id !== ""
                    ? Number(b.accesorio_material_id)
                    : null,
                accesorio_material_custom: b.accesorio_material_custom || null,
                imagen_url: imagenPrincipal,
                activo: false,
            },
        });
        if (galeria.length > 0) {
            for (const url of galeria) {
                await db_1.sequelize.query(`INSERT INTO producto_imagenes (producto_id, url, created_at)
           VALUES (:producto_id, :url, now())`, {
                    transaction: t,
                    replacements: {
                        producto_id: inserted[0].id,
                        url,
                    },
                });
            }
        }
        await t.commit();
        res.status(201).json({
            id: inserted[0].id,
            imagenes: urls,
            activo: false,
        });
    }
    catch (error) {
        console.error("❌ Error en createProduct (atomic):", error);
        await t.rollback();
        if (uploadedFiles.length > 0) {
            await supabase_1.default.storage
                .from("productos")
                .remove(uploadedFiles);
        }
        res.status(500).json({ message: "Error al crear producto" });
    }
};
exports.createProduct = createProduct;
const getSellerProducts = async (req, res) => {
    try {
        const u = req.user;
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre, precio, stock, activo, imagen_url
        FROM productos
        WHERE vendedor_id = :vid
        ORDER BY activo ASC, created_at DESC`, { replacements: { vid: u.id } });
        res.json(rows);
    }
    catch (error) {
        console.error("Error al obtener productos:", error);
        res.status(500).json({ message: "Error al obtener productos" });
    }
};
exports.getSellerProducts = getSellerProducts;
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !(0, uuid_1.validate)(id)) {
            res.status(400).json({
                message: "ID de producto inválido",
            });
            return;
        }
        const query = `
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url AS imagen_principal,
        p.departamento,
        p.municipio,
        p.rating_avg,
        p.rating_count,

        -- Categoria estructurada
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,

        -- Vendedor estructurado
        v.user_id AS vendedor_id,
        v.nombre_comercio,
        v.logo,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pi.id,
              'url', pi.url
            )
          ) FILTER (WHERE pi.id IS NOT NULL),
          '[]'
        ) AS imagenes

      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id

      WHERE p.id = :id 
      AND p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      GROUP BY 
        p.id,
        c.id,
        c.nombre,
        v.user_id,
        v.nombre_comercio,
        v.logo
      LIMIT 1
    `;
        const rows = await db_1.sequelize.query(query, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        const rawProduct = rows[0];
        try {
            await db_1.sequelize.query(`
        INSERT INTO product_views (product_id, ip_address, user_agent)
        VALUES (:product_id, :ip, :ua)
        `, {
                replacements: {
                    product_id: rawProduct.id,
                    ip: req.ip || null,
                    ua: req.headers["user-agent"] || null,
                },
                type: sequelize_1.QueryTypes.INSERT,
            });
        }
        catch (viewError) {
            console.error("Error registrando vista:", viewError);
        }
        const product = (0, buildPublicProductDTO_1.buildPublicProductDTO)(rawProduct);
        await (0, eventLogger_1.logEvent)({
            type: "product_view",
            user_id: req.user?.id || null,
            product_id: id,
        });
        if (Array.isArray(product.imagenes)) {
            product.imagenes = product.imagenes.slice(0, 4);
        }
        const relatedQuery = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.categoria_id = (
        SELECT categoria_id FROM productos WHERE id = :id
      )
      AND p.id != :id
      AND p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      ORDER BY p.created_at DESC
      LIMIT 12
    `;
        const relatedRows = await db_1.sequelize.query(relatedQuery, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        const related = (relatedRows || []).map((r) => (0, buildPublicProductCardDTO_1.buildPublicProductCardDTO)(r));
        res.json({
            product,
            related,
        });
    }
    catch (e) {
        console.error("Error en getProductById:", e);
        res.status(500).json({
            message: "Error al obtener producto",
        });
    }
};
exports.getProductById = getProductById;
const updateProduct = async (req, res) => {
    try {
        const u = req.user;
        const b = req.body;
        const id = req.params.id;
        console.log("[updateProduct] content-type:", req.headers["content-type"]);
        console.log("[updateProduct] body keys:", Object.keys(b || {}));
        console.log("[updateProduct] files:", Array.isArray(req.files)
            ? req.files.map((f) => ({
                fieldname: f.fieldname,
                originalname: f.originalname,
                mimetype: f.mimetype,
                size: f.size,
            }))
            : req.files);
        const [rows] = await db_1.sequelize.query(`SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`, { replacements: { id, vid: u.id } });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        if (b.nombre == null || b.nombre === "") {
            res.status(400).json({ message: "nombre es obligatorio" });
            return;
        }
        if (b.precio == null || b.precio === "") {
            res.status(400).json({ message: "precio es obligatorio" });
            return;
        }
        if (b.stock == null || b.stock === "") {
            res.status(400).json({ message: "stock es obligatorio" });
            return;
        }
        const precio = Number(b.precio);
        const stock = Number(b.stock);
        if (!Number.isFinite(precio) || precio <= 0) {
            res.status(400).json({ message: "Precio inválido" });
            return;
        }
        if (!Number.isInteger(stock) || stock < 0) {
            res.status(400).json({ message: "Stock inválido" });
            return;
        }
        if ((!b.categoria_id || b.categoria_id === "") &&
            (!b.categoria_custom || String(b.categoria_custom).trim() === "")) {
            res.status(400).json({
                message: "Debe seleccionar una categoría o ingresar una personalizada",
            });
            return;
        }
        const activo = b.activo === "true" ||
            b.activo === true ||
            b.activo === 1 ||
            b.activo === "1";
        const files = (Array.isArray(req.files) ? req.files : []);
        const uploadedImageUrls = [];
        for (const f of files) {
            const filename = `products/${Date.now()}-${Math.round(Math.random() * 1e9)}-${f.originalname}`;
            const { error } = await supabase_1.default.storage
                .from("productos")
                .upload(filename, f.buffer, { contentType: f.mimetype });
            if (error)
                throw error;
            const { data } = supabase_1.default.storage
                .from("productos")
                .getPublicUrl(filename);
            uploadedImageUrls.push(data.publicUrl);
        }
        await db_1.sequelize.query(`UPDATE productos
       SET
         nombre = :nombre,
         descripcion = :descripcion,
         precio = :precio,
         stock = :stock,
         categoria_id = :categoria_id,
         categoria_custom = :categoria_custom,
         clase_id = :clase_id,
         tela_id = :tela_id,
         tela_custom = :tela_custom,
         departamento = :departamento,
         municipio = :municipio,
         departamento_custom = :departamento_custom,
         municipio_custom = :municipio_custom,
         accesorio_id = :accesorio_id,
         accesorio_custom = :accesorio_custom,
         accesorio_tipo_id = :accesorio_tipo_id,
         accesorio_tipo_custom = :accesorio_tipo_custom,
         accesorio_material_id = :accesorio_material_id,
         accesorio_material_custom = :accesorio_material_custom,
         activo = :activo,
         updated_at = now()
       WHERE id = :id AND vendedor_id = :vid`, {
            replacements: {
                id,
                vid: u.id,
                nombre: b.nombre,
                descripcion: b.descripcion || null,
                precio,
                stock,
                categoria_id: b.categoria_id ? Number(b.categoria_id) : null,
                categoria_custom: b.categoria_custom || null,
                clase_id: b.clase_id ? Number(b.clase_id) : null,
                tela_id: b.tela_id ? Number(b.tela_id) : null,
                tela_custom: b.tela_custom || null,
                departamento: b.departamento || null,
                municipio: b.municipio || null,
                departamento_custom: b.departamento_custom || null,
                municipio_custom: b.municipio_custom || null,
                accesorio_id: b.accesorio_id ? Number(b.accesorio_id) : null,
                accesorio_custom: b.accesorio_custom || null,
                accesorio_tipo_id: b.accesorio_tipo_id ? Number(b.accesorio_tipo_id) : null,
                accesorio_tipo_custom: b.accesorio_tipo_custom || null,
                accesorio_material_id: b.accesorio_material_id ? Number(b.accesorio_material_id) : null,
                accesorio_material_custom: b.accesorio_material_custom || null,
                activo,
            },
        });
        if (uploadedImageUrls.length > 0) {
            for (const url of uploadedImageUrls) {
                await db_1.sequelize.query(`
          INSERT INTO producto_imagenes (producto_id, url, created_at)
          VALUES (:producto_id, :url, now())
          `, {
                    replacements: {
                        producto_id: id,
                        url,
                    },
                });
            }
            await db_1.sequelize.query(`
        UPDATE productos
        SET imagen_url = :imagen_url,
            updated_at = now()
        WHERE id = :id AND vendedor_id = :vid
        `, {
                replacements: {
                    id,
                    vid: u.id,
                    imagen_url: uploadedImageUrls[0],
                },
            });
        }
        res.json({
            message: "Producto actualizado correctamente",
            imagenesAgregadas: uploadedImageUrls.length,
            imagenPrincipalActualizada: uploadedImageUrls.length > 0,
        });
    }
    catch (e) {
        console.error("Error en updateProduct:", e);
        res.status(500).json({
            message: "Error al actualizar producto",
            error: String(e),
        });
    }
};
exports.updateProduct = updateProduct;
const setPrincipalImage = async (req, res) => {
    try {
        const u = req.user;
        const { id } = req.params;
        const { imagen_url } = req.body;
        if (!imagen_url) {
            res.status(400).json({ message: "imagen_url requerida" });
            return;
        }
        const [rows] = await db_1.sequelize.query(`
      SELECT id
      FROM productos
      WHERE id = :id AND vendedor_id = :vid
      `, {
            replacements: { id, vid: u.id },
        });
        if (!rows.length) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        await db_1.sequelize.query(`
      UPDATE productos
      SET imagen_url = :imagen_url,
          updated_at = now()
      WHERE id = :id AND vendedor_id = :vid
      `, {
            replacements: {
                id,
                vid: u.id,
                imagen_url,
            },
        });
        res.json({
            message: "Imagen principal actualizada correctamente",
        });
    }
    catch (error) {
        console.error("Error en setPrincipalImage:", error);
        res.status(500).json({
            message: "Error al actualizar imagen principal",
        });
    }
};
exports.setPrincipalImage = setPrincipalImage;
const deleteProduct = async (req, res) => {
    try {
        const u = req.user;
        const [rows] = await db_1.sequelize.query(`
      SELECT id
      FROM productos
      WHERE id = :id
      AND vendedor_id = :vid
    `, { replacements: { id: req.params.id, vid: u.id } });
        if (!rows.length) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        await db_1.sequelize.query(`DELETE FROM productos WHERE id = :id AND vendedor_id = :vid`, { replacements: { id: req.params.id, vid: u.id } });
        res.json({ message: "Producto eliminado" });
    }
    catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ message: "Error al eliminar producto" });
    }
};
exports.deleteProduct = deleteProduct;
const toggleProductActive = async (req, res) => {
    try {
        const u = req.user;
        const { activo } = req.body;
        const productId = req.params.id;
        if (!u?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        if (!productId) {
            res.status(400).json({ message: "ID de producto requerido" });
            return;
        }
        const activar = Boolean(activo);
        const vendedorEstado = await db_1.sequelize.query(`
      SELECT estado_validacion, estado_admin
      FROM vendedor_perfil
      WHERE user_id = :userId
      `, {
            replacements: { userId: u.id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!vendedorEstado.length) {
            res.status(403).json({ message: "Perfil de vendedor no encontrado" });
            return;
        }
        const perfil = vendedorEstado[0];
        if (activar === true) {
            if (perfil.estado_admin === "suspendido") {
                res.status(403).json({
                    message: "Tu comercio está suspendido y no puede activar productos.",
                });
                return;
            }
            if (perfil.estado_validacion !== "aprobado") {
                res.status(403).json({
                    message: "No puedes activar productos hasta que tu comercio sea aprobado.",
                });
                return;
            }
        }
        const producto = await db_1.sequelize.query(`
      SELECT id
      FROM productos
      WHERE id = :id AND vendedor_id = :vid
      `, {
            replacements: { id: productId, vid: u.id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!producto.length) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        await db_1.sequelize.query(`
      UPDATE productos
      SET activo = :activo,
          updated_at = now()
      WHERE id = :id AND vendedor_id = :vid
      `, {
            replacements: {
                id: productId,
                vid: u.id,
                activo: activar,
            },
        });
        res.json({
            success: true,
            message: activar
                ? "Producto activado correctamente"
                : "Producto desactivado correctamente",
            activo: activar,
        });
    }
    catch (error) {
        console.error("❌ Error en toggleProductActive:", error);
        res.status(500).json({
            message: "Error al cambiar estado del producto",
        });
    }
};
exports.toggleProductActive = toggleProductActive;
const getProductsByCategory = async (req, res) => {
    try {
        const { slug } = req.params;
        if (!slug || typeof slug !== "string") {
            res.status(400).json({ message: "Slug inválido" });
            return;
        }
        const categorias = await db_1.sequelize.query(`
      SELECT id, nombre
      FROM categorias
      WHERE LOWER(nombre) LIKE :slug
      `, {
            replacements: {
                slug: `%${slug.toLowerCase()}%`,
            },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!categorias.length) {
            res.status(404).json({ message: "Categoría no encontrada" });
            return;
        }
        const categoriaIds = categorias.map((c) => c.id);
        const productos = await db_1.sequelize.query(`
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.descripcion,
        p.imagen_url,
        p.created_at,
        c.nombre AS categoria
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE 
        p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        AND p.categoria_id IN (:categoriaIds)
      ORDER BY p.created_at DESC
      `, {
            replacements: { categoriaIds },
            type: sequelize_1.QueryTypes.SELECT,
        });
        res.json({
            success: true,
            categoria: categorias[0],
            total: productos.length,
            productos,
        });
    }
    catch (error) {
        console.error("Error al obtener productos por categoría:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener productos",
        });
    }
};
exports.getProductsByCategory = getProductsByCategory;
const getNewProducts = async (_req, res) => {
    try {
        const query = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
        AND p.imagen_url IS NOT NULL
      ORDER BY p.created_at DESC
      LIMIT 20
    `;
        const rows = await db_1.sequelize.query(query, {
            type: sequelize_1.QueryTypes.SELECT,
        });
        const data = (rows || []).map((r) => (0, buildPublicProductCardDTO_1.buildPublicProductCardDTO)(r));
        res.json(data);
    }
    catch (error) {
        console.error("Error al obtener nuevos productos:", error);
        res.status(500).json({ message: "Error al obtener nuevos productos" });
    }
};
exports.getNewProducts = getNewProducts;
const getFilteredProducts = async (req, res) => {
    try {
        const { search, categoria_id, clase_id, tela_id, accesorio_id, accesorio_tipo_id, accesorio_material_id, departamento, municipio, precioMin, precioMax, ratingMin, sort, page = "1", limit = "40", } = req.query;
        const pageNumber = Math.max(Number(page) || 1, 1);
        const limitNumber = Math.min(Math.max(Number(limit) || 40, 1), 60);
        const offset = (pageNumber - 1) * limitNumber;
        const whereConditions = [
            "p.activo = true",
            "v.estado_validacion = 'aprobado'",
            "v.estado_admin = 'activo'"
        ];
        const replacements = {
            limit: limitNumber,
            offset,
        };
        if (search && String(search).trim() !== "") {
            whereConditions.push(`
        p.search_vector @@ plainto_tsquery('spanish', :search)
      `);
            replacements.search = String(search).trim();
        }
        if (categoria_id) {
            whereConditions.push("p.categoria_id = :categoria_id");
            replacements.categoria_id = Number(categoria_id);
        }
        if (clase_id) {
            whereConditions.push("p.clase_id = :clase_id");
            replacements.clase_id = Number(clase_id);
        }
        if (tela_id) {
            whereConditions.push("p.tela_id = :tela_id");
            replacements.tela_id = Number(tela_id);
        }
        if (accesorio_id) {
            whereConditions.push("p.accesorio_id = :accesorio_id");
            replacements.accesorio_id = Number(accesorio_id);
        }
        if (accesorio_tipo_id) {
            whereConditions.push("p.accesorio_tipo_id = :accesorio_tipo_id");
            replacements.accesorio_tipo_id = Number(accesorio_tipo_id);
        }
        if (accesorio_material_id) {
            whereConditions.push("p.accesorio_material_id = :accesorio_material_id");
            replacements.accesorio_material_id = Number(accesorio_material_id);
        }
        if (departamento) {
            whereConditions.push("p.departamento = :departamento");
            replacements.departamento = departamento;
        }
        if (municipio) {
            whereConditions.push("p.municipio = :municipio");
            replacements.municipio = municipio;
        }
        if (precioMin !== undefined) {
            whereConditions.push("p.precio >= :precioMin");
            replacements.precioMin = Number(precioMin);
        }
        if (precioMax !== undefined) {
            whereConditions.push("p.precio <= :precioMax");
            replacements.precioMax = Number(precioMax);
        }
        if (ratingMin !== undefined) {
            const ratingMinNumber = Number(ratingMin);
            if (Number.isFinite(ratingMinNumber)) {
                whereConditions.push("COALESCE(p.rating_avg, 0) >= :ratingMin");
                replacements.ratingMin = ratingMinNumber;
            }
        }
        const whereSQL = whereConditions.length
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";
        let orderSQL = "ORDER BY p.created_at DESC";
        if (search && String(search).trim() !== "") {
            orderSQL = `
        ORDER BY 
        ts_rank(
          p.search_vector,
          plainto_tsquery('spanish', :search)
        ) DESC,
        p.created_at DESC
      `;
        }
        if (sort === "precio_asc")
            orderSQL = "ORDER BY p.precio ASC";
        if (sort === "precio_desc")
            orderSQL = "ORDER BY p.precio DESC";
        if (sort === "top_rated") {
            orderSQL = `
        ORDER BY 
          (p.rating_avg * LN(1 + p.rating_count)) DESC,
          p.rating_count DESC,
          p.created_at DESC
      `;
        }
        const ratingMinNumber = ratingMin !== undefined && ratingMin !== null
            ? Number(ratingMin)
            : null;
        const query = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        p.rating_avg,
        p.rating_count,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,
        ${search && String(search).trim() !== ""
            ? "ts_rank(p.search_vector, plainto_tsquery('spanish', :search)) AS rank"
            : "0 AS rank"}
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${whereSQL}
      ${orderSQL}
      LIMIT :limit
      OFFSET :offset
    `;
        const rows = await db_1.sequelize.query(query, {
            replacements,
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (search && String(search).trim() !== "") {
            await (0, eventLogger_1.logEvent)({
                type: "search_query",
                user_id: req.user?.id || null,
                metadata: { query: search },
            });
        }
        const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      ${whereSQL}
    `;
        const countResult = await db_1.sequelize.query(countQuery, {
            replacements,
            type: sequelize_1.QueryTypes.SELECT,
        });
        const total = countResult[0]?.total || 0;
        if (total === 0 && search) {
            await (0, eventLogger_1.logEvent)({
                type: "search_query",
                user_id: req.user?.id || null,
                metadata: {
                    query: search,
                    no_results: true,
                },
            });
        }
        let related = [];
        if (total === 0 && search) {
            const relatedQuery = `
        SELECT 
          p.id,
          p.nombre,
          p.precio,
          p.imagen_url,
          p.departamento,
          p.municipio,
          c.id AS categoria_id,
          c.nombre AS categoria_nombre
        FROM productos p
        JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        AND (
          p.nombre ILIKE :search
          OR p.descripcion ILIKE :search
          OR c.nombre ILIKE :search
        )
        ORDER BY p.created_at DESC
        LIMIT 24
      `;
            related = await db_1.sequelize.query(relatedQuery, {
                replacements: { search: `%${String(search).trim()}%` },
                type: sequelize_1.QueryTypes.SELECT,
            });
        }
        const data = rows.map((r) => (0, buildSearchProductDTO_1.buildSearchProductDTO)(r));
        const relatedCards = related.map((r) => (0, buildPublicProductCardDTO_1.buildPublicProductCardDTO)(r));
        res.json({
            success: true,
            total,
            page: pageNumber,
            limit: limitNumber,
            data,
            related: relatedCards,
        });
    }
    catch (error) {
        console.error("Error en getFilteredProducts:", error);
        res.status(500).json({
            message: "Error al obtener productos",
        });
    }
};
exports.getFilteredProducts = getFilteredProducts;
const getFilters = async (req, res) => {
    try {
        const tipo = req.params.tipo;
        if (!["categories", "fabrics"].includes(tipo)) {
            res.status(400).json({ message: "Tipo de filtro no válido" });
            return;
        }
        let columna = "categoria_custom";
        if (tipo === "fabrics")
            columna = "tela_custom";
        const [rows] = await db_1.sequelize.query(`SELECT DISTINCT ${columna} AS nombre FROM productos WHERE ${columna} IS NOT NULL ORDER BY nombre ASC`);
        res.json({ data: rows.map((r) => r.nombre).filter(Boolean) });
    }
    catch (e) {
        console.error("Error al obtener filtros:", e);
        res.status(500).json({ message: "Error al obtener filtros" });
    }
};
exports.getFilters = getFilters;
const getProductReviews = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({ message: "ID de producto requerido" });
            return;
        }
        const rows = await db_1.sequelize.query(`
      SELECT 
        r.id,
        r.rating,
        r.comentario,
        r.created_at,
        u.nombre AS buyer_nombre
      FROM reviews r
      JOIN users u ON u.id = r.buyer_id
      JOIN productos p ON p.id = r.producto_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE 
        r.producto_id = :id
        AND p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
      ORDER BY r.created_at DESC
      `, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        res.json({
            success: true,
            total: rows.length,
            reviews: rows,
        });
    }
    catch (error) {
        console.error("Error getProductReviews:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener reseñas",
        });
    }
};
exports.getProductReviews = getProductReviews;
const createProductReview = async (req, res) => {
    const t = await db_1.sequelize.transaction();
    try {
        const user = req.user;
        const { id } = req.params;
        const { rating, comentario } = req.body;
        if (!user?.id) {
            await t.rollback();
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        if (user.rol !== "comprador" && user.rol !== "buyer") {
            await t.rollback();
            res.status(403).json({
                message: "Solo compradores pueden dejar reseñas",
            });
            return;
        }
        const ratingNumber = Number(rating);
        if (!Number.isInteger(ratingNumber) ||
            ratingNumber < 1 ||
            ratingNumber > 5) {
            await t.rollback();
            res.status(400).json({
                message: "Rating debe ser un número entero entre 1 y 5",
            });
            return;
        }
        const producto = await db_1.sequelize.query(`
      SELECT p.id
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE 
        p.id = :id
        AND p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
      `, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
            transaction: t,
        });
        if (!producto.length) {
            await t.rollback();
            res.status(404).json({
                message: "Producto no disponible para reseñas",
            });
            return;
        }
        const existing = await db_1.sequelize.query(`
      SELECT id
      FROM reviews
      WHERE producto_id = :id AND buyer_id = :buyer_id
      `, {
            replacements: { id, buyer_id: user.id },
            type: sequelize_1.QueryTypes.SELECT,
            transaction: t,
        });
        if (existing.length > 0) {
            await t.rollback();
            res.status(400).json({
                message: "Ya has dejado una reseña para este producto",
            });
            return;
        }
        await db_1.sequelize.query(`
      INSERT INTO reviews (producto_id, buyer_id, rating, comentario)
      VALUES (:producto_id, :buyer_id, :rating, :comentario)
      `, {
            replacements: {
                producto_id: id,
                buyer_id: user.id,
                rating: ratingNumber,
                comentario: comentario || null,
            },
            transaction: t,
        });
        const ratingStats = await db_1.sequelize.query(`
      SELECT 
        COUNT(*)::int AS total,
        ROUND(AVG(rating)::numeric, 2) AS promedio
      FROM reviews
      WHERE producto_id = :id
      `, {
            replacements: { id },
            type: sequelize_1.QueryTypes.SELECT,
            transaction: t,
        });
        const totalReviews = ratingStats[0].total;
        const promedio = ratingStats[0].promedio || 0;
        await db_1.sequelize.query(`
      UPDATE productos
      SET 
        rating_avg = :rating_avg,
        rating_count = :rating_count,
        updated_at = now()
      WHERE id = :id
      `, {
            replacements: {
                id,
                rating_avg: promedio,
                rating_count: totalReviews,
            },
            transaction: t,
        });
        await t.commit();
        await (0, eventLogger_1.logEvent)({
            type: "review_created",
            user_id: user.id,
            product_id: id,
        });
        res.status(201).json({
            success: true,
            message: "Reseña creada correctamente",
            rating_avg: promedio,
            rating_count: totalReviews,
        });
    }
    catch (error) {
        await t.rollback();
        console.error("❌ Error createProductReview:", error);
        res.status(500).json({
            success: false,
            message: "Error al crear reseña",
        });
    }
};
exports.createProductReview = createProductReview;
const getTopProductsByCategory = async (req, res) => {
    try {
        const categoriaId = Number(req.params.categoriaId);
        if (!categoriaId) {
            return res.status(400).json({ message: "Categoría inválida" });
        }
        const products = await db_1.sequelize.query(`
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        COUNT(r.id) AS total_reviews,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
        (
          (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
          +
          (5.0 / (COUNT(r.id) + 5)) * 3.5
        ) AS weighted_score
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      GROUP BY p.id
      ORDER BY weighted_score DESC NULLS LAST
      LIMIT 8
      `, { type: sequelize_1.QueryTypes.SELECT });
        const normalized = products.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precio),
            imagen_url: p.imagen_url,
            total_reviews: Number(p.total_reviews),
            rating_avg: Number(Number(p.rating_avg).toFixed(2)),
            weighted_score: Number(Number(p.weighted_score).toFixed(3)),
        }));
        res.json({
            success: true,
            data: normalized,
        });
    }
    catch (error) {
        console.error("Error obteniendo top productos por categoría:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getTopProductsByCategory = getTopProductsByCategory;
const getTrendingProducts = async (req, res) => {
    try {
        const products = await db_1.sequelize.query(`
      SELECT *
      FROM (
        SELECT
          p.id,
          p.nombre,
          p.precio,
          p.created_at,
          COALESCE(
          (
            SELECT pi.url
            FROM producto_imagenes pi
            WHERE pi.producto_id = p.id
            ORDER BY pi.created_at ASC
            LIMIT 1
          ),
          p.imagen_url
        ) AS imagen_url,
          COUNT(r.id) AS total_reviews,
          COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
          (
            (
              (
                (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
                +
                (5.0 / (COUNT(r.id) + 5)) * 3.5
              ) * 0.7
              +
              (
                GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 864000)
              ) * 0.3
            )
            *
            (
              CASE 
                WHEN EXISTS (
                  SELECT 1 
                  FROM producto_imagenes pi2
                  WHERE pi2.producto_id = p.id
                )
                THEN 1
                ELSE 0.85
              END
            )
          ) AS trending_score
        FROM productos p
        JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
        LEFT JOIN reviews r ON r.producto_id = p.id
        WHERE p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        GROUP BY p.id
      ) sub
      ORDER BY
        sub.trending_score DESC,
        sub.total_reviews DESC,
        sub.created_at DESC
      LIMIT 8
      `, { type: sequelize_1.QueryTypes.SELECT });
        const normalized = products.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precio),
            imagen_url: p.imagen_url,
            total_reviews: Number(p.total_reviews),
            rating_avg: Number(p.rating_avg),
            trending_score: Number(p.trending_score),
        }));
        res.json({
            success: true,
            data: normalized,
        });
    }
    catch (error) {
        console.error("Error obteniendo trending products:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getTrendingProducts = getTrendingProducts;
