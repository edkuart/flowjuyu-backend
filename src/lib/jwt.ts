// src/lib/jwt.ts
import jwt, { SignOptions } from "jsonwebtoken";
import type { Rol } from "../middleware/auth";

interface JwtPayload {
  id: string | number;
  correo: string;
  roles: Rol[];
}

/**
 * Firma un nuevo JWT con los datos del usuario.
 */
export function signJwt(
  user: JwtPayload,
  opts: { expiresIn?: SignOptions["expiresIn"] } = {},
): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no está configurado");
  }

  const payload = {
    sub: user.id,
    correo: user.correo,
    roles: user.roles,
  };

  const options: SignOptions = {
    expiresIn: (opts.expiresIn ??
      process.env.JWT_EXPIRES_IN ??
      "1d") as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secret, options);
}

/**
 * Verifica un JWT y devuelve el payload.
 */
export function verifyJwt<T = any>(token: string): T {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no está configurado");
  }
  return jwt.verify(token, secret) as T;
}
