"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../config/db");
const sequelize_1 = require("sequelize");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const UPLOAD_DIR = path_1.default.join(process.cwd(), "uploads", "vendedores");
fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path_1.default.extname(file.originalname)}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/"))
            return cb(null, true);
        return cb(new Error("Solo se permiten imágenes"));
    },
    limits: { fileSize: 2 * 1024 * 1024 },
});
const upsertPerfil = async (req, res) => {
    try {
        const { id, nombre, email, telefono, direccion } = req.body;
        const archivo = req.file;
        if (!id) {
            res.status(400).json({ message: "Falta 'id' del vendedor" });
            return;
        }
        const rows = (await db_1.sequelize.query("SELECT imagen_url FROM seller_profile WHERE id = $1", { bind: [id], type: sequelize_1.QueryTypes.SELECT }));
        const anterior = rows[0]?.imagen_url;
        if (anterior && anterior.startsWith("/uploads/")) {
            const ruta = path_1.default.join(UPLOAD_DIR, path_1.default.basename(anterior));
            if (fs_1.default.existsSync(ruta)) {
                try {
                    fs_1.default.unlinkSync(ruta);
                }
                catch {
                }
            }
        }
        const nuevaURL = archivo
            ? `/uploads/vendedores/${archivo.filename}`
            : anterior ?? null;
        await db_1.sequelize.query(`INSERT INTO seller_profile (id, nombre, email, telefono, direccion, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         email = EXCLUDED.email,
         telefono = EXCLUDED.telefono,
         direccion = EXCLUDED.direccion,
         imagen_url = EXCLUDED.imagen_url,
         actualizado_en = CURRENT_TIMESTAMP`, {
            bind: [
                id,
                nombre ?? null,
                email ?? null,
                telefono ?? null,
                direccion ?? null,
                nuevaURL,
            ],
        });
        res.status(200).json({
            message: "Perfil actualizado correctamente.",
            imagen_url: nuevaURL,
        });
    }
    catch (error) {
        console.error("Error al guardar perfil vendedor:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};
router.post("/perfil", (0, auth_1.requireRole)("seller"), upload.single("logo"), upsertPerfil);
exports.default = router;
