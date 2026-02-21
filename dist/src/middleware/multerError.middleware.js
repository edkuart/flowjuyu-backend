"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.multerErrorHandler = multerErrorHandler;
const multer_1 = __importDefault(require("multer"));
function multerErrorHandler(err, _req, res, next) {
    if (err instanceof multer_1.default.MulterError) {
        console.error("❌ MulterError:", err);
        return res.status(400).json({
            message: err.message,
            code: err.code,
        });
    }
    if (err?.message && err.message.includes("Tipo de archivo no permitido")) {
        console.error("❌ Multer fileFilter error:", err.message);
        return res.status(400).json({
            message: err.message,
        });
    }
    if (err) {
        console.error("❌ Error no controlado:", err);
        return res.status(500).json({
            message: "Error interno del servidor",
        });
    }
    next();
}
