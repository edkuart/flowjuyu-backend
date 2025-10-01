"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadProductImages = void 0;
const multer_1 = __importDefault(require("multer"));
// Configuración en memoria (para subir luego a Supabase)
const storage = multer_1.default.memoryStorage();
// Filtro de archivos permitidos (solo imágenes)
const fileFilter = (_req, file, cb) => {
    const valid = /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype);
    if (valid)
        cb(null, true);
    else
        cb(new Error("Formato de imagen no permitido"));
};
// ✅ Export usado en product.routes.ts
exports.uploadProductImages = (0, multer_1.default)({
    storage,
    limits: { files: 9, fileSize: 5 * 1024 * 1024 },
    fileFilter,
});
