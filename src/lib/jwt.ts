// src/lib/jwt.ts
import jwt, { SignOptions } from "jsonwebtoken";
import type { Rol } from "../middleware/auth";

// ─── Access token ────────────────────────────────────────────────────────────
//
// Short-lived. Carries enough to authorize a request without a DB hit.
// Default expiry: 15 minutes (JWT_EXPIRES_IN env).

export interface JwtPayload {
  sub:           string;   // user.id as string
  email:         string;
  role:          Rol;
  token_version: number;
}

/**
 * Signs a new access token.
 * Reads expiry from JWT_EXPIRES_IN (default "15m").
 * Throws if JWT_SECRET is not set.
 */
export function signJwt(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "[jwt] JWT_SECRET is not configured. " +
      "Set it in your environment before starting the server."
    );
  }

  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "15m") as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secret, options);
}

/**
 * Verifies an access token and returns the decoded payload.
 * Throws on invalid signature, expiry, or missing secret.
 */
export function verifyJwt(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("[jwt] JWT_SECRET is not configured.");
  }

  return jwt.verify(token, secret) as JwtPayload;
}

// ─── Refresh token ───────────────────────────────────────────────────────────
//
// Long-lived. Minimal payload — only enough to look up the user and
// validate the session. Role is intentionally excluded; it is always
// read from the DB at refresh time.
// Default expiry: 7 days (JWT_REFRESH_EXPIRES_IN env).
//
// Uses a SEPARATE secret (JWT_REFRESH_SECRET) so that compromising one
// secret does not compromise both token types.

export interface RefreshTokenPayload {
  sub:           string;   // user.id as string
  token_version: number;
}

/**
 * Signs a new refresh token.
 * Reads expiry from JWT_REFRESH_EXPIRES_IN (default "7d").
 * Throws if JWT_REFRESH_SECRET is not set.
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error(
      "[jwt] JWT_REFRESH_SECRET is not configured. " +
      "Set it in your environment before starting the server."
    );
  }

  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secret, options);
}

/**
 * Verifies a refresh token and returns the decoded payload.
 * Throws on invalid signature, expiry, or missing secret.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error("[jwt] JWT_REFRESH_SECRET is not configured.");
  }

  return jwt.verify(token, secret) as RefreshTokenPayload;
}
