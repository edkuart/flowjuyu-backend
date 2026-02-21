"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const multer_1 = __importDefault(require("multer"));
const errorHandler = (err, req, res, _next) => {
    const status = err.status ?? 500;
    if (err instanceof multer_1.default.MulterError) {
        let message = "Error al subir archivos.";
        if (err.code === "LIMIT_FILE_COUNT") {
            message = "Máximo 5 imágenes por producto.";
        }
        if (err.code === "LIMIT_FILE_SIZE") {
            message = "Cada imagen puede pesar máximo 5MB.";
        }
        res.status(400).json({ message });
        return;
    }
    if (err.message === "Formato de imagen no permitido") {
        res.status(400).json({ message: err.message });
        return;
    }
    const log = req?.log;
    if (log?.error) {
        log.error({
            err: {
                name: err.name,
                message: err.message,
                stack: err.stack,
            },
            status,
        }, "Unhandled error");
    }
    else {
        console.error("Unhandled error:", err);
    }
    const body = {
        message: err.publicMessage ||
            (status === 500 ? "Internal server error" : err.message),
    };
    if (err.details) {
        body.details = err.details;
    }
    res.status(status).json(body);
};
exports.errorHandler = errorHandler;
