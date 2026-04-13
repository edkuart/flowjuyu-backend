// src/index.ts
import "./config/env";

import app from "./app";
import { assertDbConnection } from "./config/db";
import { setupConsentTables, setupPhase2Tables } from "./utils/setupTables";
import { verifyFailureIntelligenceInfra } from "./services/conversations/conversationInfraHealth.service";

// Register onboarding event listeners (side-effects only — import once here)
import "./lib/onboardingListeners";
import { getLoadedEnvFiles } from "./config/env";

const PORT = Number(process.env.PORT || 8800);

// ── Environment pre-flight check ────────────────────────────────────────────
// Validate required secrets before the server accepts any traffic.
// A missing secret causes silent runtime failures mid-request; better to
// crash loudly at boot so the problem is obvious immediately.

const REQUIRED_ENV: string[] = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "SESSION_SECRET",
];

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      "❌ Missing required environment variables:\n" +
      missing.map((k) => `   • ${k}`).join("\n") +
      "\n\nAdd them to your .env file and restart the server."
    );
    process.exit(1);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    assertEnv();
    console.log("🧾 Env cargado:", getLoadedEnvFiles().join(" -> "));

    await assertDbConnection();
    await setupPhase2Tables();
    await setupConsentTables();
    await verifyFailureIntelligenceInfra();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ No se pudo arrancar el servidor:", err);
    process.exit(1);
  }
}

bootstrap();
