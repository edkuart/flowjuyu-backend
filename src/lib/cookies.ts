// src/lib/cookies.ts
//
// Cookie helpers for the refresh-token session layer.
// The refresh token lives in an HttpOnly cookie — it is never accessible
// to JavaScript, which eliminates XSS-based token theft.

import type { Request, Response } from "express";

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

// ─── Cookie attribute helpers ─────────────────────────────────────────────────
//
// COOKIE_SAME_SITE controls cross-domain behavior:
//   "lax"  — same eTLD+1 deployments (frontend + backend both on *.flowjuyu.com)
//   "none" — cross-domain deployments (Vercel frontend + Render/Railway backend)
//             REQUIRES secure:true — browsers reject SameSite=None without Secure.
//
// Set in your production environment:
//   COOKIE_SAME_SITE=none   (cross-domain)
//   COOKIE_SAME_SITE=lax    (same-domain, default)

const isProduction = process.env.NODE_ENV === "production";

type SameSiteValue = "lax" | "none" | "strict";

function getSameSite(): SameSiteValue {
  const val = process.env.COOKIE_SAME_SITE;
  if (val === "none" || val === "strict" || val === "lax") return val;
  // Production default: "none" so the cookie is sent on cross-domain requests
  // (frontend on Vercel, backend on Railway share eTLD+1 only when custom
  //  domain api.flowjuyu.com is configured — otherwise they are cross-site).
  // SameSite=None requires Secure=true, which is already set in production.
  // Development default: "lax" (same-origin localhost, Secure not required).
  return isProduction ? "none" : "lax";
}

// ─── setRefreshTokenCookie ───────────────────────────────────────────────────

/**
 * Attaches the refresh token to the response as an HttpOnly cookie.
 * `sameSite` is configurable via COOKIE_SAME_SITE env var (default "lax").
 * `secure` is enabled only in production.
 * `maxAge` stays in sync with JWT_REFRESH_EXPIRES_IN.
 */
export function setRefreshTokenCookie(res: Response, token: string): void {
  const maxAgeMs = parseDurationMs(
    process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    SEVEN_DAYS_MS
  );

  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  // Clear any legacy host-only/domain-scoped variants first so the browser
  // doesn't keep multiple fj_rt cookies and send them together.
  clearRefreshTokenCookie(res);

  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: getSameSite(),
    path:     "/",
    secure:   isProduction,
    maxAge:   maxAgeMs,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

// ─── clearRefreshTokenCookie ─────────────────────────────────────────────────

/**
 * Clears the refresh token cookie.
 * All cookie attributes must match the original Set-Cookie call for the
 * browser to actually delete the cookie.
 */
export function clearRefreshTokenCookie(res: Response): void {
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const candidateDomains = [
    undefined,
    cookieDomain,
    cookieDomain?.startsWith(".") ? cookieDomain.slice(1) : cookieDomain ? `.${cookieDomain}` : undefined,
  ].filter((value, index, array): value is string | undefined =>
    array.findIndex((item) => item === value) === index,
  );

  for (const domain of candidateDomains) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      sameSite: getSameSite(),
      path:     "/",
      secure:   isProduction,
      ...(domain ? { domain } : {}),
    });
  }
}

export function getRefreshTokenFromRequest(req: Pick<Request, "cookies" | "headers">): string | undefined {
  const rawCookieHeader = req.headers?.cookie;

  if (typeof rawCookieHeader === "string" && rawCookieHeader.trim()) {
    const values = rawCookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        const eqIndex = part.indexOf("=");
        if (eqIndex === -1) return [];

        const name = part.slice(0, eqIndex).trim();
        if (name !== REFRESH_TOKEN_COOKIE) return [];

        const value = part.slice(eqIndex + 1).trim();
        if (!value) return [];

        try {
          return [decodeURIComponent(value)];
        } catch {
          return [value];
        }
      });

    if (values.length > 0) {
      return values[values.length - 1];
    }
  }

  const parsed = req.cookies?.[REFRESH_TOKEN_COOKIE];
  return typeof parsed === "string" && parsed.trim() ? parsed : undefined;
}
