// src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from "express";

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
  const status = err.status ?? 500;

  // Nunca filtres secretos ni tokens
  // Log estructurado mínimo:
  // console.error({ err: { name: err.name, message: err.message, stack: err.stack } });

  const body: Record<string, unknown> = {
    message:
      err.publicMessage || (status === 500 ? "Internal error" : err.message),
  };

  // Exponer detalles solo si no son sensibles y ayudan a cliente
  if (err.details) body.details = err.details;

  res.status(status).json(body);
}
