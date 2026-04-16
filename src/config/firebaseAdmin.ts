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

const REQUIRED_ENV_VARS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY_BASE64",
] as const;

function readRequiredEnv(name: (typeof REQUIRED_ENV_VARS)[number]): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  throw new Error(
    `[firebaseAdmin] Missing required env var ${name}. ` +
    "Google Auth requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
    "and FIREBASE_PRIVATE_KEY_BASE64 to be configured before the server starts.",
  );
}

function decodePrivateKeyFromBase64(raw: string): string {
  let decoded: string;

  try {
    decoded = Buffer.from(raw, "base64").toString("utf-8").trim();
  } catch (error) {
    throw new Error(
      `[firebaseAdmin] FIREBASE_PRIVATE_KEY_BASE64 is not valid base64: ${(error as Error).message}`,
    );
  }

  const hasBegin = decoded.includes("-----BEGIN PRIVATE KEY-----");
  const hasEnd = decoded.includes("-----END PRIVATE KEY-----");

  if (!hasBegin || !hasEnd) {
    throw new Error(
      "[firebaseAdmin] FIREBASE_PRIVATE_KEY_BASE64 decoded successfully but does not contain a valid PEM private key.",
    );
  }

  return decoded;
}

if (!admin.apps.length) {
  const projectId = readRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = readRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = decodePrivateKeyFromBase64(
    readRequiredEnv("FIREBASE_PRIVATE_KEY_BASE64"),
  );

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
