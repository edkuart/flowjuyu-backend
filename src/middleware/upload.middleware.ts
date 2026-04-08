// src/middleware/upload.middleware.ts

import multer from "multer";
import type { RequestHandler } from "express";
import { validateFileSignature, SUPPORTED_MIME_TYPES } from "../lib/fileSignature";

// ---------------------------
// 🎞️ Configuración de Multer
// ---------------------------
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB
  },
  fileFilter: (_req, file, cb) => {
    // 1. MIME type allowlist — application/octet-stream is intentionally excluded
    //    because it is a generic binary type that bypasses format validation.
    //    image/jpg is the non-standard alias sent by some mobile clients.
    const allowedMime = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

    if (!allowedMime.includes(file.mimetype)) {
      console.error("❌ Multer fileFilter: MIME type rechazado:", file.mimetype);
      return cb(new Error("Tipo de archivo no permitido"));
    }

    // 2. Magic-byte validation happens after multer buffers the file.
    //    We attach a flag here so the post-upload handler can verify.
    //    The actual check runs in validateUploadedFiles() below.
    cb(null, true);
  },
});

// ---------------------------
// 📂 Middleware exportado
// 🔥 ALINEADO CON FRONTEND
// ---------------------------
export const uploadVendedorDocs: RequestHandler = upload.fields([
  { name: "logo",            maxCount: 1 },
  { name: "foto_dpi_frente", maxCount: 1 },
  { name: "foto_dpi_reverso",maxCount: 1 },
  { name: "selfie_con_dpi",  maxCount: 1 },
]);

/**
 * validateUploadedFiles — express middleware
 *
 * Must be chained after uploadVendedorDocs. Iterates every buffered file and
 * compares its magic bytes against the declared MIME type. Rejects the request
 * with 400 if any file's content doesn't match its MIME type header.
 *
 * This is the second defence layer after the MIME allowlist check in fileFilter.
 */
export const validateUploadedFiles: RequestHandler = (req, res, next) => {
  const filesMap = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  if (!filesMap) return next();

  for (const [field, files] of Object.entries(filesMap)) {
    for (const file of files) {
      if (!SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
        res.status(400).json({
          ok: false,
          message: `Tipo de archivo no soportado en campo '${field}'.`,
        });
        return;
      }

      if (!validateFileSignature(file.mimetype, file.buffer)) {
        console.error(
          `❌ Magic-byte mismatch: field="${field}" declared="${file.mimetype}" ` +
          `first4=${file.buffer.slice(0, 4).toString("hex")}`
        );
        res.status(400).json({
          ok: false,
          message: `El archivo en '${field}' no corresponde al tipo declarado.`,
        });
        return;
      }
    }
  }

  next();
};

export default uploadVendedorDocs;
