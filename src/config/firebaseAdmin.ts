import admin from "firebase-admin";

// ─── Fail-fast initialization ────────────────────────────────────────────────
// Google auth is a first-class login path, so the backend must never boot in a
// half-configured state where the route exists but session exchange always
// fails at runtime.
//
// Required env vars (Firebase Console → Project Settings → Service Accounts):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY  (PEM key with newlines escaped as \n in .env)

const REQUIRED_ENV_VARS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

function readRequiredEnv(name: (typeof REQUIRED_ENV_VARS)[number]): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  throw new Error(
    `[firebaseAdmin] Missing required env var ${name}. ` +
    "Google Auth requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
    "and FIREBASE_PRIVATE_KEY to be configured before the server starts.",
  );
}

function normalizePrivateKey(raw: string): string {
  const unwrapped = raw
    .replace(/^"(.*)"$/s, "$1")
    .replace(/^'(.*)'$/s, "$1");

  return unwrapped.replace(/\\n/g, "\n").trim();
}

if (!admin.apps.length) {
  const projectId = readRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = readRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(readRequiredEnv("FIREBASE_PRIVATE_KEY"));

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
