//src/middleware/multerProducts.ts

import multer from "multer";
import { Request, Response, NextFunction } from "express";

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const valid = /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype);
  if (valid) cb(null, true);
  else cb(new Error("Formato de imagen no permitido"));
};

export const uploadProductImages = multer({
  storage,
  limits: {
    files: 5, // 🔥 CAMBIADO DE 9 → 5
    fileSize: 3 * 1024 * 1024, // 3 MB hard limit — client should compress before this
  },
  fileFilter,
});

/**
 * Optional middleware: log uploaded image sizes to stdout.
 * Chain after uploadProductImages in any route that needs it:
 *   router.post("/productos", uploadProductImages.array("imagenes", 5), logUploadSizes, handler)
 */
export function logUploadSizes(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.ENABLE_PERF_LOGS !== "true") return next();
  const files = Array.isArray(req.files) ? req.files : [];
  files.forEach((f) => {
    console.log(`📦 [UPLOAD] ${f.originalname} — ${(f.size / 1024).toFixed(1)} KB (${f.mimetype})`);
  });
  next();
}
