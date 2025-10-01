// src/middleware/authJwt.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

function normalizeRole(raw?: string): "seller" | "buyer" | "admin" | undefined {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase();
  if (["seller", "vendedor"].includes(v)) return "seller";
  if (["buyer", "comprador"].includes(v)) return "buyer";
  if (["admin", "administrator"].includes(v)) return "admin";
  return undefined;
}

export function requireAuth(
  role?: "seller" | "buyer" | "admin",
): RequestHandler {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ message: "No auth token" });
      return;
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "cortes_secret",
      ) as any;
      const normalized = normalizeRole(decoded.rol || decoded.role);

      req.user = { id: Number(decoded.id), role: normalized || "buyer" }; // default conservador

      if (role && req.user.role !== role) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }
      next();
    } catch (e) {
      res.status(401).json({ message: "Token inválido" });
    }
  };
}
