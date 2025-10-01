// src/middleware/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { VerifyOptions } from "jsonwebtoken";

export type Rol = "buyer" | "seller" | "admin";

interface DecodedLegacyToken {
  id?: string | number;
  correo?: string;
  rol?: Rol; // legado: un solo rol
  roles?: Rol[]; // nuevo: lista de roles
  iat?: number;
  exp?: number;
  sub?: string; // estándar JWT subject
}

// ----- utils -----
function getBearerToken(req: Request): string | null {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice("Bearer ".length).trim();
  const cookieTok = (req as any).cookies?.access_token as string | undefined; // requiere cookie-parser si lo usas
  return cookieTok || null;
}

function normalizeRoles(payload: DecodedLegacyToken): Rol[] {
  if (Array.isArray(payload.roles) && payload.roles.length)
    return payload.roles as Rol[];
  if (payload.rol) return [payload.rol]; // soporte legado
  return [];
}

function getUserId(payload: DecodedLegacyToken): string | number | undefined {
  return payload.sub ?? payload.id; // preferimos sub (estándar)
}

// (opcional) fallback a sesión si está habilitado por env
function readUserFromSession(
  req: Request,
): { id?: string | number; correo?: string; roles?: Rol[] } | null {
  if (process.env.AUTH_ALLOW_SESSION_FALLBACK !== "true") return null;
  const sessUser = (req.session as any)?.user;
  if (!sessUser?.id) return null;
  return {
    id: sessUser.id,
    correo: sessUser.correo,
    roles: Array.isArray(sessUser.roles) ? sessUser.roles : [],
  };
}

// ----- core -----
export const verifyToken =
  (roles: Rol[] = []): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ message: "JWT no configurado" });
      return;
    }

    const token = getBearerToken(req);

    // 1) sin token → intenta sesión si está permitido; si no, 401
    if (!token) {
      const s = readUserFromSession(req);
      if (s?.id) {
        const userRoles = (s.roles || []) as Rol[];
        if (roles.length > 0 && !userRoles.some((r) => roles.includes(r))) {
          res.status(403).json({ message: "Acceso denegado por rol" });
          return;
        }
        (req as any).user = { id: s.id, correo: s.correo, roles: userRoles };
        next();
        return;
      }
      res.status(401).json({ message: "Token no proporcionado" });
      return;
    }

    try {
      // 2) Verificación con algoritmo(s) permitidos
      const verifyOpts: VerifyOptions = {};
      const algs = (process.env.JWT_ALGS || "HS256")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (algs.length)
        verifyOpts.algorithms = algs as VerifyOptions["algorithms"];

      const decoded = jwt.verify(
        token,
        secret,
        verifyOpts,
      ) as DecodedLegacyToken;

      const userId = getUserId(decoded);
      if (!userId) {
        res.status(401).json({ message: "Token inválido (sin subject)" });
        return;
      }

      const userRoles = normalizeRoles(decoded);
      if (roles.length > 0 && !userRoles.some((r) => roles.includes(r))) {
        res.status(403).json({ message: "Acceso denegado por rol" });
        return;
      }

      (req as any).user = {
        id: userId,
        correo: decoded.correo,
        roles: userRoles,
      };
      next();
    } catch {
      res.status(401).json({ message: "Token inválido o expirado" });
    }
  };

export const requireAuth: RequestHandler = verifyToken();

export const requireRole = (...allowed: Rol[]): RequestHandler =>
  verifyToken(allowed);
