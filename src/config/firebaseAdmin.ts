import admin from "firebase-admin";

// ─── Conditional initialization ────────────────────────────────────────────────
// Only initialize if all three service-account fields are present in the
// environment. Missing credentials are not a startup error — they simply
// mean Google login will return 503 until the env is configured.
//
// Required env vars (from Firebase Console → Project Settings → Service Accounts):
//   FIREBASE_PROJECT_ID    e.g. flowjuyu-70653
//   FIREBASE_CLIENT_EMAIL  e.g. firebase-adminsdk-xxx@flowjuyu-70653.iam.gserviceaccount.com
//   FIREBASE_PRIVATE_KEY   the full PEM key (newlines as \n in .env)

if (!admin.apps.length) {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    console.warn(
      "[firebaseAdmin] Firebase Admin SDK not initialized — " +
      "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are required. " +
      "POST /api/login/google will return 503 until they are set.",
    );
  }
}

export default admin;
