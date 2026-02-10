// src/middleware/upload.middleware.ts
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

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
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    // ⚠️ PowerShell / Postman suelen enviar application/octet-stream
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