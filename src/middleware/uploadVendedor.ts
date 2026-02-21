// src/middleware/uploadVendedor.ts
import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response, NextFunction } from "express";

// ─────────────────────────────────────────────
// Directorio base
// ─────────────────────────────────────────────
const uploadDir = path.resolve("uploads/vendedores");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique =
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10);

    cb(null, `${unique}${ext}`);
  },
});

// ─────────────────────────────────────────────
// File filter
// ─────────────────────────────────────────────
const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
];

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error("Solo se permiten imágenes JPG, PNG o WEBP")
    );
  }

  cb(null, true);
}

// ─────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────
const limits = {
  fileSize: 3 * 1024 * 1024, // 3MB
};

// ─────────────────────────────────────────────
// Multer instance
// ─────────────────────────────────────────────
export const uploadVendedorDocs = multer({
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
// Validación obligatoria de documentos
// ─────────────────────────────────────────────
export function validateRequiredDocs(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  };

  if (
    !files?.fotoDPIFrente ||
    !files?.fotoDPIReverso ||
    !files?.selfieConDPI
  ) {
    return res.status(400).json({
      message:
        "Debes subir las 3 imágenes obligatorias (DPI frente, reverso y selfie).",
    });
  }

  next();
}