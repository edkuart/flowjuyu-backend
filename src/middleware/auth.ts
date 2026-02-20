// src/middleware/auth.ts

import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { VerifyOptions } from "jsonwebtoken";
import { User } from "../models/user.model";

// ─────────────────────────────────────────────
// 🎯 Roles oficiales del sistema (INGLÉS ONLY)
// ─────────────────────────────────────────────
export type Rol =
  | "buyer"
  | "seller"
  | "admin"
  | "support";

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
// 🆔 Obtener ID del token
// ─────────────────────────────────────────────
function getUserId(payload: DecodedToken) {
  return payload.sub ?? payload.id;
}

// ─────────────────────────────────────────────
// 🔐 verifyToken(rolesRequeridos)
// ─────────────────────────────────────────────
export const verifyToken = (
  rolesRequeridos: Rol[] = []
): RequestHandler => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error("❌ JWT_SECRET no configurado");
      res.status(500).json({ message: "Error interno: JWT no configurado" });
      return;
    }

    const token = getBearerToken(req);

    if (!token) {
      res.status(401).json({ message: "Token no proporcionado" });
      return;
    }

    try {
      // ─────────────────────────────────────────
      // 🔐 Verificación JWT
      // ─────────────────────────────────────────
      const verifyOpts: VerifyOptions = {};
      const algs = (process.env.JWT_ALGS || "HS256")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (algs.length) {
        verifyOpts.algorithms = algs as VerifyOptions["algorithms"];
      }

      const decoded = jwt.verify(token, secret, verifyOpts) as DecodedToken;

      // ─────────────────────────────────────────
      // 🆔 Resolver userId (sub o id)
      // ─────────────────────────────────────────
      const userId = decoded.sub ?? decoded.id;

      if (!userId) {
        res.status(401).json({ message: "Token inválido: sin ID" });
        return;
      }

      // ─────────────────────────────────────────
      // 🔎 Usuario en BD
      // ─────────────────────────────────────────
      const user = await User.findByPk(userId);

      if (!user) {
        res.status(401).json({ message: "Usuario no existe" });
        return;
      }

      // ─────────────────────────────────────────
      // 🔒 token_version (logout global)
      // ─────────────────────────────────────────
      if (
        typeof decoded.token_version === "number" &&
        decoded.token_version !== user.token_version
      ) {
        res.status(401).json({
          message: "Sesión inválida. Inicia sesión nuevamente.",
        });
        return;
      }

      // ─────────────────────────────────────────
      // 🚫 Suspensión
      // ─────────────────────────────────────────
      if ((user as any).estado === "suspendido") {
        res.status(403).json({ message: "Cuenta suspendida" });
        return;
      }

      // ─────────────────────────────────────────
      // 🎯 Normalización FUERTE de roles
      //  - token.roles (array)
      //  - token.rol (string)
      //  - user.rol (fallback BD)
      //  - lowercase + trim
      // ─────────────────────────────────────────
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

      // 🔎 DEBUG (puedes dejarlo temporalmente)
      console.log("🧭 baseUrl:", req.baseUrl, "| path:", req.path, "| originalUrl:", req.originalUrl);
      console.log("🧠 rolesRequeridos:", rolesRequeridos);
      console.log("🧠 userRoles:", userRoles);

      // ─────────────────────────────────────────
      // 🔐 Validación de permisos
      // ─────────────────────────────────────────
      const permitido =
        rolesRequeridos.length === 0 ||
        rolesRequeridos.some((r) =>
          userRoles.includes(String(r).toLowerCase().trim() as Rol)
        );

      if (!permitido) {
        console.warn(
          `🚫 Acceso denegado. Requerido: [${rolesRequeridos.join(
            ", "
          )}] | Usuario: [${userRoles.join(", ")}]`
        );
        res.status(403).json({ message: "Acceso denegado por rol" });
        return;
      }

      // ─────────────────────────────────────────
      // ✅ Inyectar usuario en request
      // ─────────────────────────────────────────
      req.user = {
        id: userId,
        correo: decoded.correo,
        rol: userRoles[0],
        roles: userRoles,
      };

      next();
    } catch (error: any) {
      if (error?.name === "TokenExpiredError") {
        console.warn("⏰ Token expirado");
        res.status(401).json({
          message: "Token expirado",
          code: "TOKEN_EXPIRED",
        });
        return;
      }

      console.error("❌ Error al verificar token:", error);
      res.status(401).json({ message: "Token inválido" });
    }
  };
};

// ─────────────────────────────────────────────
// 🧱 Middlewares listos para usar
// ─────────────────────────────────────────────

// Solo autenticación
export const requireAuth: RequestHandler = verifyToken();

// Autenticación + rol específico
export const requireRole = (...allowed: Rol[]): RequestHandler => {
  return verifyToken(allowed);
};
