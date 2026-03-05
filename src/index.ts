// src/index.ts
import "dotenv/config";

import app from "./app";
import { assertDbConnection } from "./config/db";

const PORT = Number(process.env.PORT || 8800);

console.log("🚀 SERVIDOR NUEVO ARRANCANDO 2026 🔥");

async function bootstrap() {
  try {
    await assertDbConnection();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ No se pudo arrancar el servidor:", err);
    process.exit(1);
  }
}

bootstrap();
