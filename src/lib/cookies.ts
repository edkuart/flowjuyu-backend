// src/lib/cookies.ts
//
// Cookie helpers for the refresh-token session layer.
// The refresh token lives in an HttpOnly cookie — it is never accessible
// to JavaScript, which eliminates XSS-based token theft.

import type { Response } from "express";

// ─── Cookie name ─────────────────────────────────────────────────────────────
//
// "fj_rt" → Flowjuyu Refresh Token.
// Short, project-namespaced, avoids collisions with other apps on the domain.
// Exported so that controllers can reference it when reading req.cookies.

export const REFRESH_TOKEN_COOKIE = "fj_rt";

// ─── Duration helper ─────────────────────────────────────────────────────────
//
// Converts a JWT-style expiry string ("15m", "7d", "1h") to milliseconds
// so the cookie maxAge stays in sync with the JWT lifetime.
// Defaults to the provided fallback if the string is unrecognised.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function parseDurationMs(str: string, fallbackMs: number): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return fallbackMs;

  const n = parseInt(match[1], 10);

  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default:  return fallbackMs;
  }
}

// ─── setRefreshTokenCookie ───────────────────────────────────────────────────

/**
 * Attaches the refresh token to the response as an HttpOnly, SameSite=lax
 * cookie. `maxAge` is derived from JWT_REFRESH_EXPIRES_IN (default 7 days)
 * so cookie lifetime stays in sync with token lifetime.
 *
 * `secure` is enabled only in production, allowing local dev over HTTP.
 */
export function setRefreshTokenCookie(res: Response, token: string): void {
  const maxAgeMs = parseDurationMs(
    process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    SEVEN_DAYS_MS
  );

  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   maxAgeMs,
  });
}

// ─── clearRefreshTokenCookie ─────────────────────────────────────────────────

/**
 * Clears the refresh token cookie.
 * All cookie attributes must match the original Set-Cookie call for the
 * browser to actually delete the cookie.
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    secure:   process.env.NODE_ENV === "production",
  });
}
