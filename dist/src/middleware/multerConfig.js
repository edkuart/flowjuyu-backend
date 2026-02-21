"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const carpetaDestino = path_1.default.join(__dirname, "../../uploads/vendedores");
if (!fs_1.default.existsSync(carpetaDestino)) {
    fs_1.default.mkdirSync(carpetaDestino, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, carpetaDestino),
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const nombreSeguro = `${file.fieldname}-${Date.now()}${ext}`;
        cb(null, nombreSeguro);
    },
});
const fileFilter = (_req, file, cb) => {
    const valid = /jpeg|jpg|png|webp/.test(file.mimetype);
    if (valid)
        cb(null, true);
    else
        cb(new Error("Formato de imagen no permitido"));
};
exports.upload = (0, multer_1.default)({ storage, fileFilter });
