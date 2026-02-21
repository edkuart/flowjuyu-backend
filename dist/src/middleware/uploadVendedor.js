"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVendedorDocs = void 0;
exports.validateRequiredDocs = validateRequiredDocs;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadDir = path_1.default.resolve("uploads/vendedores");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const unique = Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 10);
        cb(null, `${unique}${ext}`);
    },
});
const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
];
function fileFilter(_req, file, cb) {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP"));
    }
    cb(null, true);
}
const limits = {
    fileSize: 3 * 1024 * 1024,
};
exports.uploadVendedorDocs = (0, multer_1.default)({
    storage,
    fileFilter,
    limits,
}).fields([
    { name: "fotoDPIFrente", maxCount: 1 },
    { name: "fotoDPIReverso", maxCount: 1 },
    { name: "selfieConDPI", maxCount: 1 },
    { name: "logo", maxCount: 1 },
]);
function validateRequiredDocs(req, res, next) {
    const files = req.files;
    if (!files?.fotoDPIFrente ||
        !files?.fotoDPIReverso ||
        !files?.selfieConDPI) {
        return res.status(400).json({
            message: "Debes subir las 3 imágenes obligatorias (DPI frente, reverso y selfie).",
        });
    }
    next();
}
