// src/middleware/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { VerifyOptions } from "jsonwebtoken";

export type Rol = "comprador" | "vendedor" | "admin" | "buyer" | "seller";

interface DecodedLegacyToken {
  id?: string | number;
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
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();

  const cookieToken = (req as any).cookies?.access_token as string | undefined;
  return cookieToken || null;
}

function normalizeRoles(payload: DecodedLegacyToken): Rol[] {
  const roles = new Set<Rol>();

  // Extraer roles desde el token
  if (Array.isArray(payload.roles)) {
    payload.roles.forEach((r) => roles.add(r));
  } else if (payload.rol) {
    roles.add(payload.rol);
  }

  // Normalizar equivalencias inglés ↔ español
  const normalized = Array.from(roles).map((r) => {
    switch (r) {
      case "seller": return "vendedor";
      case "buyer": return "comprador";
      default: return r.toLowerCase() as Rol;
    }
  });

  return normalized as Rol[];
}

function getUserId(payload: DecodedLegacyToken): string | number | undefined {
  return payload.sub ?? payload.id;
}

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

// ──────────────────────────────
// 🔐 verifyToken()
// ──────────────────────────────
export const verifyToken = (roles: Rol[] = []): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("❌ JWT_SECRET no configurado");
      res.status(500).json({ message: "JWT no configurado" });
      return;
    }

    const token = getBearerToken(req);
    if (!token) {
      const session = readUserFromSession(req);
      if (session?.id) {
        (req as any).user = session;
        return next();
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

      const decoded = jwt.verify(token, secret, verifyOpts) as DecodedLegacyToken;
      const userId = getUserId(decoded);

      if (!userId) {
        res.status(401).json({ message: "Token inválido (sin ID de usuario)" });
        return;
      }

      const userRoles = normalizeRoles(decoded);

      const hasRole =
        roles.length === 0 ||
        userRoles.some(
          (r) =>
            roles.includes(r) ||
            (r === "vendedor" && roles.includes("seller")) ||
            (r === "seller" && roles.includes("vendedor")) ||
            (r === "comprador" && roles.includes("buyer")) ||
            (r === "buyer" && roles.includes("comprador"))
        );

      if (!hasRole) {
        console.warn(
          `🚫 Acceso denegado. Requerido: ${roles.join(", ")} | Usuario: ${userRoles.join(", ")}`
        );
        res.status(403).json({ message: "Acceso denegado por rol" });
        return;
      }

      (req as any).user = {
        id: userId,
        correo: decoded.correo,
        rol: decoded.rol || userRoles[0],
        roles: userRoles,
      };

      next();
    } catch (err) {
      console.error("❌ Error al verificar token:", err);
      res.status(401).json({ message: "Token inválido o expirado" });
    }
  };
};

// ──────────────────────────────
// 🧱 Middlewares listos
// ──────────────────────────────
function normalizeRoleName(role: Rol): Rol {
  switch (role.toLowerCase()) {
    case "seller": return "vendedor";
    case "buyer": return "comprador";
    default: return role.toLowerCase() as Rol;
  }
}

export const requireAuth: RequestHandler = verifyToken();

export const requireRole = (...allowed: Rol[]): RequestHandler => {
  const normalizedAllowed = allowed.map(normalizeRoleName) as Rol[];
  return verifyToken(normalizedAllowed);
};
