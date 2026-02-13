// src/index.ts
import dotenv from "dotenv";
import app from "./app";
import { sequelize, assertDbConnection } from "./config/db";

console.log("🚀 SERVIDOR NUEVO ARRANCANDO 2026 🔥");  // 👈 AQUÍ

dotenv.config();

const PORT = Number(process.env.PORT || 8800);

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

