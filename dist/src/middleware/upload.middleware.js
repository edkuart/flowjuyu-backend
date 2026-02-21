"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVendedorDocs = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const uploadsDir = path_1.default.join(process.cwd(), "uploads", "vendedores");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueName = `${(0, crypto_1.randomUUID)()}${path_1.default.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/octet-stream",
        ];
        if (!allowed.includes(file.mimetype)) {
            console.error("❌ Multer fileFilter error:", file.mimetype);
            return cb(new Error("Tipo de archivo no permitido"));
        }
        cb(null, true);
    },
});
exports.uploadVendedorDocs = upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "fotoDPIFrente", maxCount: 1 },
    { name: "fotoDPIReverso", maxCount: 1 },
    { name: "selfieConDPI", maxCount: 1 },
]);
exports.default = exports.uploadVendedorDocs;
