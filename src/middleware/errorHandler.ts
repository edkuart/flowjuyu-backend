// src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from "express";
import multer from "multer";

type PublicError = Error & {
  status?: number;
  publicMessage?: string;
  details?: unknown;
};

export function errorHandler(
  err: PublicError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // 🔥 Manejo específico de errores Multer
  if (err instanceof multer.MulterError) {
    let message = "Error al subir archivos.";

    if (err.code === "LIMIT_FILE_COUNT") {
      message = "Máximo 5 imágenes por producto.";
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      message = "Cada imagen puede pesar máximo 5MB.";
    }

    return res.status(400).json({ message });
  }

  // 🔥 Error por tipo de archivo no permitido
  if (err.message === "Formato de imagen no permitido") {
    return res.status(400).json({
      message: err.message,
    });
  }

  const status = err.status ?? 500;

  // Log estructurado mínimo (seguro)
  // console.error({ err: { name: err.name, message: err.message, stack: err.stack } });

  const body: Record<string, unknown> = {
    message:
      err.publicMessage || (status === 500 ? "Internal error" : err.message),
  };

  if (err.details) body.details = err.details;

  res.status(status).json(body);
}