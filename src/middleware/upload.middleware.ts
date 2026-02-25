// src/middleware/upload.middleware.ts

import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

// ---------------------------
// 🔧 Configuración general
// ---------------------------
const uploadsDir = path.join(process.cwd(), "uploads", "vendedores");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ---------------------------
// 🎞️ Configuración de Multer
// ---------------------------
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
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

// ---------------------------
// 📂 Middleware exportado
// 🔥 ALINEADO CON FRONTEND
// ---------------------------
export const uploadVendedorDocs = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "foto_dpi_frente", maxCount: 1 },
  { name: "foto_dpi_reverso", maxCount: 1 },
  { name: "selfie_con_dpi", maxCount: 1 },
]);

export default uploadVendedorDocs;