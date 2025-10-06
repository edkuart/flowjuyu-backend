"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleProductActive = exports.deleteProduct = exports.updateProduct = exports.getProductById = exports.getSellerProducts = exports.createProduct = exports.getAccesorioMateriales = exports.getAccesorioTipos = exports.getAccesorios = exports.getTelas = exports.getRegiones = exports.getClases = exports.getCategorias = exports.uploadProductImages = void 0;
const db_1 = require("../config/db");
const multer_1 = __importDefault(require("multer"));
const supabase_1 = __importDefault(require("../lib/supabase"));
// ===========================
// Configuración de Multer (en memoria)
// ===========================
const storage = multer_1.default.memoryStorage();
const fileFilter = (_req, file, cb) => /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Solo imágenes permitidas"));
exports.uploadProductImages = (0, multer_1.default)({
    storage,
    limits: { files: 9, fileSize: 5 * 1024 * 1024 },
    fileFilter,
});
// ===========================
// GETs auxiliares
// ===========================
const getCategorias = async (_req, res) => {
    const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM categorias ORDER BY nombre ASC`);
    res.json(rows);
};
exports.getCategorias = getCategorias;
const getClases = async (_req, res) => {
    const [rows] = await db_1.sequelize.query(`SELECT id, nombre, alias FROM clases ORDER BY nombre ASC`);
    res.json(rows);
};
exports.getClases = getClases;
const getRegiones = async (_req, res) => {
    const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM regiones ORDER BY nombre ASC`);
    res.json(rows);
};
exports.getRegiones = getRegiones;
const getTelas = async (req, res) => {
    const claseId = Number(req.query.clase_id);
    if (!claseId) {
        res.status(400).json({ message: "clase_id requerido" });
        return;
    }
    const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM telas WHERE clase_id = :claseId ORDER BY nombre ASC`, { replacements: { claseId } });
    res.json(rows);
};
exports.getTelas = getTelas;
const getAccesorios = async (req, res) => {
    try {
        const tipo = req.query.tipo || "normal";
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre, categoria_tipo
       FROM accesorios
       WHERE categoria_tipo = :tipo
       ORDER BY nombre ASC`, { replacements: { tipo } });
        res.json(rows);
    }
    catch (e) {
        console.error("Error en getAccesorios:", e);
        res
            .status(500)
            .json({ message: "Error al obtener accesorios", error: String(e) });
    }
};
exports.getAccesorios = getAccesorios;
const getAccesorioTipos = async (req, res) => {
    const accesorioId = Number(req.query.accesorio_id);
    if (!accesorioId) {
        res.status(400).json({ message: "accesorio_id requerido" });
        return;
    }
    const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM accesorio_tipos WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`, { replacements: { accesorioId } });
    res.json(rows);
};
exports.getAccesorioTipos = getAccesorioTipos;
const getAccesorioMateriales = async (req, res) => {
    const accesorioId = Number(req.query.accesorio_id);
    if (!accesorioId) {
        res.status(400).json({ message: "accesorio_id requerido" });
        return;
    }
    const [rows] = await db_1.sequelize.query(`SELECT id, nombre FROM accesorio_materiales WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`, { replacements: { accesorioId } });
    res.json(rows);
};
exports.getAccesorioMateriales = getAccesorioMateriales;
// ===========================
// Crear producto (con Supabase Storage)
// ===========================
const createProduct = async (req, res) => {
    try {
        const u = req.user;
        const b = req.body;
        if (!b.nombre || !b.descripcion || !b.precio || !b.stock) {
            res.status(400).json({ message: "Campos obligatorios faltantes" });
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
        // 📤 Subir imágenes a Supabase
        const files = req.files || [];
        const urls = [];
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
            urls.push(data.publicUrl);
        }
        const primera = urls[0] ?? null;
        const [inserted] = await db_1.sequelize.query(`INSERT INTO productos (
        vendedor_id, nombre, descripcion, precio, stock,
        categoria_id, clase_id, tela_id, region_id,
        accesorio_id, accesorio_custom,
        accesorio_tipo_id, accesorio_tipo_custom,
        accesorio_material_id, accesorio_material_custom,
        imagen_url, activo, created_at, updated_at
      ) VALUES (
        :vendedor_id, :nombre, :descripcion, :precio, :stock,
        :categoria_id, :clase_id, :tela_id, :region_id,
        :accesorio_id, :accesorio_custom,
        :accesorio_tipo_id, :accesorio_tipo_custom,
        :accesorio_material_id, :accesorio_material_custom,
        :imagen_url, :activo, now(), now()
      ) RETURNING id`, {
            replacements: {
                vendedor_id: u?.id ?? null,
                nombre: b.nombre,
                descripcion: b.descripcion,
                precio,
                stock,
                categoria_id: b.categoria_id ? Number(b.categoria_id) : null,
                clase_id: b.clase_id ? Number(b.clase_id) : null,
                tela_id: b.tela_id ? Number(b.tela_id) : null,
                region_id: b.region_id ? Number(b.region_id) : null,
                accesorio_id: b.accesorio_id ? Number(b.accesorio_id) : null,
                accesorio_custom: b.accesorio_custom || null,
                accesorio_tipo_id: b.accesorio_tipo_id
                    ? Number(b.accesorio_tipo_id)
                    : null,
                accesorio_tipo_custom: b.accesorio_tipo_custom || null,
                accesorio_material_id: b.accesorio_material_id
                    ? Number(b.accesorio_material_id)
                    : null,
                accesorio_material_custom: b.accesorio_material_custom || null,
                imagen_url: primera,
                activo: b.activo === "true" || b.activo === true,
            },
        });
        res.status(201).json({ id: inserted[0].id, imagenes: urls });
    }
    catch (e) {
        console.error("Error en createProduct:", e);
        res
            .status(500)
            .json({ message: "Error al crear producto", error: String(e) });
    }
};
exports.createProduct = createProduct;
// ===========================
// Listar productos del vendedor
// ===========================
const getSellerProducts = async (req, res) => {
    try {
        const u = req.user;
        if (!u?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const [rows] = await db_1.sequelize.query(`SELECT id, nombre, precio, stock, activo, imagen_url
       FROM productos
       WHERE vendedor_id = :vid
       ORDER BY created_at DESC`, { replacements: { vid: u.id } });
        res.json(rows);
    }
    catch (e) {
        console.error("Error en getSellerProducts:", e);
        res
            .status(500)
            .json({ message: "Error al obtener productos", error: String(e) });
    }
};
exports.getSellerProducts = getSellerProducts;
// ===========================
// Obtener producto por ID
// ===========================
const getProductById = async (req, res) => {
    try {
        const u = req.user;
        const { id } = req.params;
        const [rows] = await db_1.sequelize.query(`SELECT * FROM productos WHERE id = :id AND vendedor_id = :vid`, { replacements: { id, vid: u.id } });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        res.json(rows[0]);
    }
    catch (e) {
        console.error("Error en getProductById:", e);
        res
            .status(500)
            .json({ message: "Error al obtener producto", error: String(e) });
    }
};
exports.getProductById = getProductById;
// ===========================
// Actualizar producto
// ===========================
const updateProduct = async (req, res) => {
    try {
        const u = req.user;
        const { id } = req.params;
        const b = req.body;
        const [rows] = await db_1.sequelize.query(`SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`, { replacements: { id, vid: u.id } });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        await db_1.sequelize.query(`UPDATE productos
       SET nombre = :nombre, descripcion = :descripcion,
           precio = :precio, stock = :stock, activo = :activo,
           updated_at = now()
       WHERE id = :id AND vendedor_id = :vid`, {
            replacements: {
                id,
                vid: u.id,
                nombre: b.nombre,
                descripcion: b.descripcion || null,
                precio: Number(b.precio),
                stock: Number(b.stock),
                activo: b.activo === "true" || b.activo === true,
            },
        });
        res.json({ message: "Producto actualizado correctamente" });
    }
    catch (e) {
        console.error("Error en updateProduct:", e);
        res
            .status(500)
            .json({ message: "Error al actualizar producto", error: String(e) });
    }
};
exports.updateProduct = updateProduct;
// ===========================
// Eliminar producto
// ===========================
const deleteProduct = async (req, res) => {
    try {
        const u = req.user;
        const { id } = req.params;
        const [rows] = await db_1.sequelize.query(`SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`, { replacements: { id, vid: u.id } });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        await db_1.sequelize.query(`DELETE FROM productos WHERE id = :id AND vendedor_id = :vid`, {
            replacements: { id, vid: u.id },
        });
        res.json({ message: "Producto eliminado" });
    }
    catch (e) {
        console.error("Error en deleteProduct:", e);
        res
            .status(500)
            .json({ message: "Error al eliminar producto", error: String(e) });
    }
};
exports.deleteProduct = deleteProduct;
// ===========================
// Activar / Desactivar producto
// ===========================
const toggleProductActive = async (req, res) => {
    try {
        const u = req.user;
        const { id } = req.params;
        const { activo } = req.body;
        const [rows] = await db_1.sequelize.query(`SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`, { replacements: { id, vid: u.id } });
        if (!rows || rows.length === 0) {
            res.status(404).json({ message: "Producto no encontrado" });
            return;
        }
        await db_1.sequelize.query(`UPDATE productos SET activo = :activo, updated_at = now()
       WHERE id = :id AND vendedor_id = :vid`, { replacements: { id, vid: u.id, activo: Boolean(activo) } });
        res.json({ message: "Estado actualizado", activo });
    }
    catch (e) {
        console.error("Error en toggleProductActive:", e);
        res
            .status(500)
            .json({ message: "Error al cambiar estado", error: String(e) });
    }
};
exports.toggleProductActive = toggleProductActive;
