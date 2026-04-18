import admin from "firebase-admin";

// ─── Firebase Admin SDK initialization ───────────────────────────────────────
//
// Requires ONE environment variable:
//
//   FIREBASE_PRIVATE_KEY_BASE64  — the entire service-account JSON base64-encoded
//
// How to generate it (PowerShell):
//
//   $json = Get-Content "service-account.json" -Raw
//   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
//
// How to generate it (bash):
//
//   base64 -w 0 service-account.json
//
// Set the output as FIREBASE_PRIVATE_KEY_BASE64 in .env and in Railway.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function createFirebaseAdminError(message: string, cause?: unknown): Error {
  const error = new Error(message) as Error & { cause?: unknown };

  if (cause !== undefined) {
    error.cause = cause;
  }

  return error;
}

function decodeServiceAccount(): ServiceAccount {
  const base64 = process.env["FIREBASE_PRIVATE_KEY_BASE64"]?.trim();

  if (!base64) {
    throw new Error(
      "[firebaseAdmin] Missing required env var: FIREBASE_PRIVATE_KEY_BASE64. " +
      "Set it to the base64-encoded contents of your Firebase service account JSON.",
    );
  }

  // ── Step 1: base64 → raw JSON string ────────────────────────────────────────
  let jsonString: string;
  try {
    jsonString = Buffer.from(base64, "base64").toString("utf-8");
  } catch (err) {
    throw createFirebaseAdminError(
      "[firebaseAdmin] FIREBASE_PRIVATE_KEY_BASE64 is not valid base64.",
      err,
    );
  }

  // ── Step 2: parse JSON ───────────────────────────────────────────────────────
  let account: ServiceAccount;
  try {
    account = JSON.parse(jsonString) as ServiceAccount;
  } catch (err) {
    throw createFirebaseAdminError(
      "[firebaseAdmin] Failed to parse service account JSON. Make sure FIREBASE_PRIVATE_KEY_BASE64 contains the full JSON file encoded in base64.",
      err,
    );
  }

  // ── Step 3: validate required fields ────────────────────────────────────────
  if (typeof account.project_id !== "string" || account.project_id.trim() === "") {
    throw new Error("[firebaseAdmin] Service account JSON is missing 'project_id'.");
  }
  if (typeof account.client_email !== "string" || account.client_email.trim() === "") {
    throw new Error("[firebaseAdmin] Service account JSON is missing 'client_email'.");
  }
  if (typeof account.private_key !== "string" || account.private_key.trim() === "") {
    throw new Error("[firebaseAdmin] Service account JSON is missing 'private_key'.");
  }

  // JSON.parse already turns the escaped \n sequences stored in the service
  // account JSON into real newline characters, so no manual .replace(/\\n/g)
  // normalization is needed when we decode and parse the full JSON payload.
  if (!account.private_key.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "[firebaseAdmin] private_key does not contain a valid PEM block. " +
      "Check that the service account JSON was not corrupted during encoding.",
    );
  }

  return account;
}

if (!admin.apps.length) {
  const account = decodeServiceAccount();

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: account.project_id,
        clientEmail: account.client_email,
        privateKey: account.private_key,
      }),
    });
    console.log(`[firebaseAdmin] Initialized — project: ${account.project_id}`);
  } catch (err) {
    console.error("[firebaseAdmin] Initialization failed", {
      error: err instanceof Error ? err.message : String(err),
      projectId: account.project_id,
      clientEmail: account.client_email,
    });

    throw createFirebaseAdminError(
      "[firebaseAdmin] Failed to initialize Firebase Admin SDK.",
      err,
    );
  }
}

export default admin;
