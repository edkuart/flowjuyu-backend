// src/middleware/auth.ts

import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { VerifyOptions } from "jsonwebtoken";
import { User } from "../models/user.model";

// ─────────────────────────────────────────────
// Role type — single source of truth
// ─────────────────────────────────────────────
export type Rol = "buyer" | "seller" | "admin" | "support";

// ─────────────────────────────────────────────
// Decoded token shape — canonical only
//
// REMOVED: id, correo, rol, roles[]
// Token identifies the user (sub) and carries token_version.
// Role is ALWAYS resolved from the DB, never trusted from the token.
// ─────────────────────────────────────────────
interface DecodedToken {
  sub:           string;
  email:         string;
  role:          Rol;
  token_version: number;
  iat?:          number;
  exp?:          number;
}

// ─────────────────────────────────────────────
// Bearer token extraction
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
// verifyToken middleware
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
        res.status(500).json({ message: "Configuración interna inválida" });
        return;
      }

      const token = getBearerToken(req);

      if (!token) {
        console.warn(
          `[auth][verifyToken] missing_token method=${req.method} path=${req.originalUrl} has_auth_header=${Boolean(req.headers.authorization)}`
        );
        res.status(401).json({ message: "Token no proporcionado" });
        return;
      }

      // ── Verify signature and expiry ──
      const verifyOpts: VerifyOptions = {};
      const algs = (process.env.JWT_ALGS || "HS256")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (algs.length) {
        verifyOpts.algorithms = algs as VerifyOptions["algorithms"];
      }

      const decoded = jwt.verify(token, secret, verifyOpts) as DecodedToken;

      // sub is required — rejects any pre-Phase-2 token missing it
      if (!decoded.sub) {
        res.status(401).json({ message: "Token inválido" });
        return;
      }

      // ── Load user from DB ──
      const user = await User.findByPk(decoded.sub);

      if (!user) {
        console.warn(
          `[auth][verifyToken] user_not_found method=${req.method} path=${req.originalUrl} sub=${decoded.sub}`
        );
        res.status(401).json({ message: "Usuario no existe" });
        return;
      }

      // ── token_version — logout-all invalidation ──
      // Rejects tokens issued before the last logoutAll / password change.
      // Also rejects legacy tokens that omit token_version (undefined !== number).
      if (decoded.token_version !== user.token_version) {
        console.warn(
          `[auth][verifyToken] token_version_mismatch method=${req.method} path=${req.originalUrl} sub=${decoded.sub}`
        );
        res.status(401).json({
          message: "Sesión inválida. Inicia sesión nuevamente.",
        });
        return;
      }

      // ── Suspension check ──
      if ((user as any).estado === "suspendido") {
        res.status(403).json({ message: "Cuenta suspendida" });
        return;
      }

      // ── Role authorization — DB is the authority ──
      //
      // The token role is NOT used here. We read rol from the User record
      // so that role changes take effect immediately without re-login.
      const dbRole = user.rol as Rol;

      if (rolesRequeridos.length > 0 && !rolesRequeridos.includes(dbRole)) {
        res.status(403).json({ message: "Acceso denegado por rol" });
        return;
      }

      // ── Inject user into request ──
      req.user = {
        id:    Number(decoded.sub),
        email: user.correo,
        role:  dbRole,
      };

      next();
    } catch (error: any) {
      if (error?.name === "TokenExpiredError") {
        console.warn(
          `[auth][verifyToken] token_expired method=${req.method} path=${req.originalUrl}`
        );
        res.status(401).json({
          message: "Token expirado",
          code:    "TOKEN_EXPIRED",
        });
        return;
      }

      console.error("❌ Error JWT:", error?.message || error);
      res.status(401).json({ message: "Token inválido" });
    }
  };
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

export const requireAuth: RequestHandler = verifyToken();

export const requireRole = (...allowed: Rol[]): RequestHandler =>
  verifyToken(allowed);
