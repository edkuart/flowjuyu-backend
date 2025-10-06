// src/middleware/upload.middleware.ts
import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";
import { randomUUID } from "crypto"; // ✅ reemplaza a uuid v4 (nativo en Node 16+)

// ---------------------------
// 🔧 Configuración general
// ---------------------------
const uploadsDir = path.join(process.cwd(), "uploads", "vendedores");

// Si no existe la carpeta, la creamos
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ---------------------------
// 🎞️ Configuración de Multer
// ---------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    // usa el UUID nativo del módulo crypto
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
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
export const uploadVendedorDocs = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "fotoDPIFrente", maxCount: 1 },
  { name: "fotoDPIReverso", maxCount: 1 },
  { name: "selfieConDPI", maxCount: 1 },
]);

export default uploadVendedorDocs;
