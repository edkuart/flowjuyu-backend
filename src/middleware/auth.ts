// src/middleware/auth.ts

import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { VerifyOptions } from "jsonwebtoken";
import { User } from "../models/user.model";

// ─────────────────────────────────────────────
// 🎯 Roles oficiales del sistema
// ─────────────────────────────────────────────
export type Rol = "buyer" | "seller" | "admin" | "support";

// ─────────────────────────────────────────────
// 📦 Tipo del token decodificado
// ─────────────────────────────────────────────
interface DecodedToken {
  id?: number | string;
  correo?: string;
  rol?: Rol;
  roles?: Rol[];
  iat?: number;
  exp?: number;
  sub?: string;
  token_version?: number;
}

// ─────────────────────────────────────────────
// 🔑 Obtener token del header o cookie
// ─────────────────────────────────────────────
function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization || "";

  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }

  const cookieToken = req.cookies?.access_token as string | undefined;
  return cookieToken || null;
}

// ─────────────────────────────────────────────
// 🔐 verifyToken
// ─────────────────────────────────────────────
export const verifyToken = (
  rolesRequeridos: Rol[] = []
): RequestHandler => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const secret = process.env.JWT_SECRET;

      if (!secret) {
        console.error("❌ JWT_SECRET no configurado");
        res.status(500).json({
          message: "Configuración interna inválida",
        });
        return;
      }

      const token = getBearerToken(req);

      if (!token) {
        res.status(401).json({ message: "Token no proporcionado" });
        return;
      }

      // 🔐 Verificar JWT
      const verifyOpts: VerifyOptions = {};
      const algs = (process.env.JWT_ALGS || "HS256")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (algs.length) {
        verifyOpts.algorithms = algs as VerifyOptions["algorithms"];
      }

      const decoded = jwt.verify(token, secret, verifyOpts) as DecodedToken;

      const userId = decoded.sub ?? decoded.id;

      if (!userId) {
        res.status(401).json({ message: "Token inválido" });
        return;
      }

      // 🔎 Buscar usuario en BD
      const user = await User.findByPk(userId);

      if (!user) {
        res.status(401).json({ message: "Usuario no existe" });
        return;
      }

      // 🔒 token_version (logout global)
      if (
        typeof decoded.token_version === "number" &&
        decoded.token_version !== user.token_version
      ) {
        res.status(401).json({
          message: "Sesión inválida. Inicia sesión nuevamente.",
        });
        return;
      }

      // 🚫 Suspensión
      if ((user as any).estado === "suspendido") {
        res.status(403).json({ message: "Cuenta suspendida" });
        return;
      }

      // 🎯 Normalización de roles
      const tokenRoles: string[] = Array.isArray(decoded.roles)
        ? decoded.roles
        : decoded.rol
        ? [decoded.rol]
        : [];

      const dbRole: string[] = (user as any)?.rol
        ? [(user as any).rol]
        : [];

      const userRoles = Array.from(
        new Set(
          [...tokenRoles, ...dbRole]
            .map((r) => String(r).toLowerCase().trim())
            .filter(Boolean)
        )
      ) as Rol[];

      // 🔐 Validación de permisos
      const permitido =
        rolesRequeridos.length === 0 ||
        rolesRequeridos.some((r) =>
          userRoles.includes(r)
        );

      if (!permitido) {
        res.status(403).json({
          message: "Acceso denegado por rol",
        });
        return;
      }

      // ✅ Inyectar usuario en request
      (req as any).user = {
        id: Number(userId),
        correo: decoded.correo,
        role: userRoles[0],
        roles: userRoles,
      };

      next();
    } catch (error: any) {
      if (error?.name === "TokenExpiredError") {
        res.status(401).json({
          message: "Token expirado",
          code: "TOKEN_EXPIRED",
        });
        return;
      }

      console.error("❌ Error JWT:", error?.message || error);
      res.status(401).json({ message: "Token inválido" });
    }
  };
};

// ─────────────────────────────────────────────
// 🧱 Helpers
// ─────────────────────────────────────────────

export const requireAuth: RequestHandler = verifyToken();

export const requireRole = (...allowed: Rol[]): RequestHandler =>
  verifyToken(allowed);
