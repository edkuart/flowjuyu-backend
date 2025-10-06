// src/middleware/uploadVendedor.ts
import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

// ─────────────────────────────────────────────
// Directorio base para las subidas
// ─────────────────────────────────────────────
const uploadDir = path.resolve("uploads/vendedores");

// Crear carpeta si no existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─────────────────────────────────────────────
// Configuración de almacenamiento
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    cb(null, `${unique}${ext}`);
  },
});

// ─────────────────────────────────────────────
// Filtro de tipos de archivo permitidos
// ─────────────────────────────────────────────
function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
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
export const uploadVendedor = multer({
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
export function handleUploadError(
  err: any,
  _req: Request,
  res: any,
  next: any
) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Error en archivo: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
}
