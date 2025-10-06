"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVendedorDocs = void 0;
// src/middleware/upload.middleware.ts
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto"); // ✅ reemplaza a uuid v4 (nativo en Node 16+)
// ---------------------------
// 🔧 Configuración general
// ---------------------------
const uploadsDir = path_1.default.join(process.cwd(), "uploads", "vendedores");
// Si no existe la carpeta, la creamos
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// ---------------------------
// 🎞️ Configuración de Multer
// ---------------------------
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        // usa el UUID nativo del módulo crypto
        const uniqueName = `${(0, crypto_1.randomUUID)()}${path_1.default.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // máximo 5 MB por archivo
    },
    fileFilter: (_req, file, cb) => {
        // Aceptamos solo imágenes comunes
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Tipo de archivo no permitido"));
        }
        cb(null, true);
    },
});
// ---------------------------
// 📂 Middleware exportado
// ---------------------------
exports.uploadVendedorDocs = upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "fotoDPIFrente", maxCount: 1 },
    { name: "fotoDPIReverso", maxCount: 1 },
    { name: "selfieConDPI", maxCount: 1 },
]);
exports.default = exports.uploadVendedorDocs;
