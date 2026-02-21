"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadProductImages = void 0;
const multer_1 = __importDefault(require("multer"));
const storage = multer_1.default.memoryStorage();
const fileFilter = (_req, file, cb) => {
    const valid = /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype);
    if (valid)
        cb(null, true);
    else
        cb(new Error("Formato de imagen no permitido"));
};
exports.uploadProductImages = (0, multer_1.default)({
    storage,
    limits: {
        files: 5,
        fileSize: 5 * 1024 * 1024
    },
    fileFilter,
});
