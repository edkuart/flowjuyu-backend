// src/middleware/multerError.middleware.ts
import { Request, Response, NextFunction } from "express";
import multer from "multer";

export function multerErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
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

  // otros errores
  if (err) {
    console.error("❌ Error no controlado:", err);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }

  next();
}
