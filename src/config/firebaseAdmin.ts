import admin from "firebase-admin";

// ─── Fail-fast initialization ────────────────────────────────────────────────
// Google auth is a first-class login path, so the backend must never boot in a
// half-configured state where the route exists but session exchange always
// fails at runtime.
//
// Required env vars (Firebase Console → Project Settings → Service Accounts):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY_BASE64  (PEM key encoded as base64 for Railway-safe transport)

// ── Private key resolution ───────────────────────────────────────────────────
// Accepts either format:
//   FIREBASE_PRIVATE_KEY_BASE64  — PEM key base64-encoded (Railway-safe)
//   FIREBASE_PRIVATE_KEY         — raw PEM key (legacy / direct paste)
// Base64 variant takes precedence when both are present.

function resolvePrivateKey(): string {
  const base64 = process.env["FIREBASE_PRIVATE_KEY_BASE64"]?.trim();
  const raw    = process.env["FIREBASE_PRIVATE_KEY"]?.trim();

  if (base64) {
    let decoded: string;
    try {
      decoded = Buffer.from(base64, "base64").toString("utf-8").trim();
    } catch (err) {
      throw new Error(
        `[firebaseAdmin] FIREBASE_PRIVATE_KEY_BASE64 is not valid base64: ${(err as Error).message}`,
      );
    }
    if (!decoded.includes("-----BEGIN PRIVATE KEY-----")) {
      throw new Error(
        "[firebaseAdmin] FIREBASE_PRIVATE_KEY_BASE64 decoded but does not contain a valid PEM key.",
      );
    }
    return decoded;
  }

  if (raw) {
    // Railway / shell sometimes stores \n as a literal backslash-n — normalise it.
    const normalised = raw.replace(/\\n/g, "\n");
    if (!normalised.includes("-----BEGIN PRIVATE KEY-----")) {
      throw new Error(
        "[firebaseAdmin] FIREBASE_PRIVATE_KEY does not contain a valid PEM key.",
      );
    }
    return normalised;
  }

  throw new Error(
    "[firebaseAdmin] Neither FIREBASE_PRIVATE_KEY_BASE64 nor FIREBASE_PRIVATE_KEY is set. " +
    "Google Auth requires a Firebase service-account private key.",
  );
}

if (!admin.apps.length) {
  const projectId = process.env["FIREBASE_PROJECT_ID"]?.trim();
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"]?.trim();

  if (!projectId)   throw new Error("[firebaseAdmin] Missing FIREBASE_PROJECT_ID");
  if (!clientEmail) throw new Error("[firebaseAdmin] Missing FIREBASE_CLIENT_EMAIL");

  const privateKey = resolvePrivateKey();

  try {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  } catch (error) {
    throw new Error(
      `[firebaseAdmin] Failed to initialize Firebase Admin SDK: ${(error as Error).message}`,
    );
  }
}

export default admin;
