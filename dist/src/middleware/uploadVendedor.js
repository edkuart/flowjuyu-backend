"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVendedor = void 0;
exports.handleUploadError = handleUploadError;
// src/middleware/uploadVendedor.ts
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ─────────────────────────────────────────────
// Directorio base para las subidas
// ─────────────────────────────────────────────
const uploadDir = path_1.default.resolve("uploads/vendedores");
// Crear carpeta si no existe
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// ─────────────────────────────────────────────
// Configuración de almacenamiento
// ─────────────────────────────────────────────
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const unique = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        cb(null, `${unique}${ext}`);
    },
});
// ─────────────────────────────────────────────
// Filtro de tipos de archivo permitidos
// ─────────────────────────────────────────────
function fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
        return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
    cb(null, true);
}
// ─────────────────────────────────────────────
// Límite de tamaño (por archivo)
// ─────────────────────────────────────────────
const limits = {
    fileSize: 3 * 1024 * 1024, // 3 MB
};
// ─────────────────────────────────────────────
// Campos esperados del vendedor
// ─────────────────────────────────────────────
exports.uploadVendedor = (0, multer_1.default)({
    storage,
    fileFilter,
    limits,
}).fields([
    { name: "fotoDPIFrente", maxCount: 1 },
    { name: "fotoDPIReverso", maxCount: 1 },
    { name: "selfieConDPI", maxCount: 1 },
    { name: "logo", maxCount: 1 },
]);
// ─────────────────────────────────────────────
// Middleware de manejo de errores para multer
// ─────────────────────────────────────────────
function handleUploadError(err, _req, res, next) {
    if (err instanceof multer_1.default.MulterError) {
        return res.status(400).json({ message: `Error en archivo: ${err.message}` });
    }
    else if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
}
