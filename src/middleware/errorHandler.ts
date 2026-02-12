// src/middleware/errorHandler.ts

import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import multer from "multer";

type PublicError = Error & {
  status?: number;
  publicMessage?: string;
  details?: unknown;
};

export const errorHandler: ErrorRequestHandler = (
  err: PublicError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const status = err.status ?? 500;

  // ===============================
  // 🔹 Multer errors (upload)
  // ===============================
  if (err instanceof multer.MulterError) {
    let message = "Error al subir archivos.";

    if (err.code === "LIMIT_FILE_COUNT") {
      message = "Máximo 5 imágenes por producto.";
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      message = "Cada imagen puede pesar máximo 5MB.";
    }

    res.status(400).json({ message });
    return;
  }

  // ===============================
  // 🔹 Error por tipo de archivo
  // ===============================
  if (err.message === "Formato de imagen no permitido") {
    res.status(400).json({ message: err.message });
    return;
  }

  // ===============================
  // 🔹 Logging estructurado
  // ===============================
  const log = (req as any)?.log;

  if (log?.error) {
    log.error(
      {
        err: {
          name: err.name,
          message: err.message,
          stack: err.stack,
        },
        status,
      },
      "Unhandled error"
    );
  } else {
    console.error("Unhandled error:", err);
  }

  // ===============================
  // 🔹 Respuesta pública segura
  // ===============================
  const body: Record<string, unknown> = {
    message:
      err.publicMessage ||
      (status === 500 ? "Internal server error" : err.message),
  };

  if (err.details) {
    body.details = err.details;
  }

  res.status(status).json(body);
};
