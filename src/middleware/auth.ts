// src/middleware/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { VerifyOptions } from "jsonwebtoken";
import { User } from "../models/user.model";

// ─────────────────────────────────────────────────────────────
// 💠 ROLES PERMITIDOS
// ─────────────────────────────────────────────────────────────
export type Rol =
  | "comprador"
  | "vendedor"
  | "admin"
  | "soporte"
  | "buyer"
  | "seller"
  | "support";

// Token decodificado
interface DecodedToken {
  id?: number | string;
  correo?: string;
  rol?: Rol;
  roles?: Rol[];
  iat?: number;
  exp?: number;
  sub?: string;
}

// ──────────────────────────────
// 🧩 Utilidades internas
// ──────────────────────────────
function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();

  // fallback cookie token
  const cookieToken = (req as any).cookies?.access_token as string | undefined;
  return cookieToken || null;
}

// Normalizar roles para aceptar inglés ↔ español
function normalizeRoles(payload: DecodedToken): Rol[] {
  const roles = new Set<Rol>();

  // Extraer roles del token
  if (Array.isArray(payload.roles)) {
    payload.roles.forEach((r) => roles.add(r));
  } else if (payload.rol) {
    roles.add(payload.rol);
  }

  // Normalizar equivalencias inglés ↔ español
  const normalized = Array.from(roles).map((r) => {
  const role = r.toLowerCase();

  switch (role) {
    case "seller":
      return "vendedor";
    case "buyer":
      return "comprador";
    case "support":
      return "soporte";
    default:
      return role as Rol;
  }
});


  return normalized as Rol[];
}

// ID del usuario desde token
function getUserId(payload: DecodedToken) {
  return payload.sub ?? payload.id;
}

// Permitir fallback por sesión opcional
function readUserFromSession(req: Request) {
  if (process.env.AUTH_ALLOW_SESSION_FALLBACK !== "true") return null;

  const s = (req.session as any)?.user;
  if (!s?.id) return null;

  return {
    id: s.id,
    correo: s.correo,
    roles: Array.isArray(s.roles) ? s.roles : [],
  };
}

// ─────────────────────────────────────────────────────────────
// 🔐 verifyToken(rolesRequeridos)
// ─────────────────────────────────────────────────────────────
export const verifyToken = (rolesRequeridos: Rol[] = []) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("❌ JWT_SECRET no configurado");
      res.status(500).json({ message: "Error interno: JWT no configurado" });
      return;
    }

    const token = getBearerToken(req);
    if (!token) {
      const sessionUser = readUserFromSession(req);
      if (sessionUser) {
        (req as any).user = sessionUser;
        next();
        return;
      }
      res.status(401).json({ message: "Token no proporcionado" });
      return;
    }

    try {
      const verifyOpts: VerifyOptions = {};
      const algs = (process.env.JWT_ALGS || "HS256")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (algs.length) verifyOpts.algorithms = algs as VerifyOptions["algorithms"];

      const decoded = jwt.verify(token, secret, verifyOpts) as DecodedToken;
      const userId = getUserId(decoded);

      if (!userId) {
        res.status(401).json({ message: "Token inválido: sin ID" });
        return;
      }

      const userRoles = normalizeRoles(decoded);

      const tienePermiso =
        rolesRequeridos.length === 0 ||
        userRoles.some((rol) => rolesRequeridos.includes(rol));

      if (!tienePermiso) {
        console.warn(
          `🚫 Acceso denegado. Requerido: [${rolesRequeridos.join(
            ", "
          )}] | Usuario: [${userRoles.join(", ")}]`
        );
        res.status(403).json({ message: "Acceso denegado por rol" });
        return;
      }

      // ✅ Guardar datos del usuario en req.user
      (req as any).user = {
        id: userId,
        correo: decoded.correo,
        rol: decoded.rol || userRoles[0],
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
  res.status(401).json({
    message: "Token inválido",
  });
  return;
}

  };
};

// ──────────────────────────────
// 🌐 Normalizador de roles
// ──────────────────────────────
function normalizeRoleName(role: Rol): Rol {
  switch (role.toLowerCase()) {
    case "seller":
      return "vendedor";
    case "buyer":
      return "comprador";
    default:
      return role.toLowerCase() as Rol;
  }
}

// ──────────────────────────────
// 🧱 Middlewares exportados listos
// ──────────────────────────────

// ✅ Requiere solo autenticación (sin validar rol)
export const requireAuth: RequestHandler = verifyToken();

// ✅ Requiere autenticación + rol específico
export const requireRole = (...allowed: Rol[]): RequestHandler => {
  const normalizedAllowed = allowed.map(normalizeRoleName) as Rol[];
  return verifyToken(normalizedAllowed);
};
