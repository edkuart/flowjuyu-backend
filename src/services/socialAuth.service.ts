// src/services/socialAuth.service.ts
//
// Provider abstraction for social (OAuth) login.
// Each provider verifier returns a normalised SocialProfile or throws SocialAuthError.
// The controller stays thin — it calls verifySocialToken() and handles HTTP concerns.

import admin from "../config/firebaseAdmin";

// ── Types ────────────────────────────────────────────────────────────────────

export type SocialProvider = "google" | "facebook" | "apple";

/** Normalised identity returned by every provider verifier. */
export interface SocialProfile {
  provider: SocialProvider;
  /** Provider-side user ID (sub / uid). */
  providerId: string;
  email: string;
  emailVerified: boolean;
  /** Display name as provided by the provider (may be undefined). */
  name?: string;
}

/** Thrown when token verification fails. HTTP semantics live in the controller. */
export class SocialAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SocialAuthError";
  }
}

// ── Google ───────────────────────────────────────────────────────────────────

/**
 * Verify a Firebase ID token issued by the Google provider.
 *
 * Uses Firebase Admin SDK which validates:
 *   - RS256 signature against Google public keys
 *   - Token expiry (< 1 h)
 *   - `aud` matches Firebase project ID
 *   - `iss` is `accounts.google.com/<PROJECT_ID>`
 *   - Token has not been revoked (`checkRevoked: true`)
 */
export async function verifyGoogleToken(id_token: string): Promise<SocialProfile> {
  let payload: admin.auth.DecodedIdToken;
  try {
    payload = await admin.auth().verifyIdToken(id_token, /* checkRevoked */ true);
  } catch (err: any) {
    console.error("[firebaseAdmin] verifyIdToken failed:", {
      code:    err?.code,
      message: err?.message,
    });
    const code =
      err?.code === "auth/id-token-revoked" ? "TOKEN_REVOKED" : "TOKEN_INVALID";
    throw new SocialAuthError(
      code,
      "Token de Google inválido o expirado. Vuelve a iniciar sesión.",
    );
  }

  return {
    provider:      "google",
    providerId:    payload.uid,
    email:         payload.email ?? "",
    emailVerified: !!payload.email_verified,
    name:          payload.name,
  };
}

// ── Facebook ─────────────────────────────────────────────────────────────────

/**
 * Verify a Facebook access token.
 * Stub — throws NOT_IMPLEMENTED until the Facebook App is configured.
 */
export async function verifyFacebookToken(_id_token: string): Promise<SocialProfile> {
  throw new SocialAuthError(
    "PROVIDER_NOT_IMPLEMENTED",
    "Facebook login aún no está disponible.",
  );
}

// ── Apple ────────────────────────────────────────────────────────────────────

/**
 * Verify an Apple identity token.
 * Stub — throws NOT_IMPLEMENTED until Sign in with Apple is configured.
 */
export async function verifyAppleToken(_id_token: string): Promise<SocialProfile> {
  throw new SocialAuthError(
    "PROVIDER_NOT_IMPLEMENTED",
    "Apple login aún no está disponible.",
  );
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

const SUPPORTED_PROVIDERS: SocialProvider[] = ["google", "facebook", "apple"];

export function isSupportedProvider(value: unknown): value is SocialProvider {
  return typeof value === "string" && SUPPORTED_PROVIDERS.includes(value as SocialProvider);
}

/**
 * Dispatch to the correct provider verifier based on `provider`.
 * Throws SocialAuthError for unsupported providers or verification failures.
 */
export async function verifySocialToken(
  provider: SocialProvider,
  id_token: string,
): Promise<SocialProfile> {
  switch (provider) {
    case "google":
      return verifyGoogleToken(id_token);
    case "facebook":
      return verifyFacebookToken(id_token);
    case "apple":
      return verifyAppleToken(id_token);
  }
}
