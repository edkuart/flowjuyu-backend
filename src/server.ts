// src/server.ts
import "dotenv/config";

import http from "http";
import app from "./app";
import { sequelize } from "./config/db";
import { logger } from "./config/logger";

const PORT = Number(process.env.PORT || 8800);

const server = http.createServer(app);

// Timeouts de servidor (evitan requests colgadas)
server.requestTimeout = 30_000;     // 30s total por request
server.headersTimeout = 35_000;     // headers timeout debe ser > requestTimeout
server.keepAliveTimeout = 65_000;   // conexiones keep-alive

server.listen(PORT, () => {
  logger.info({ port: PORT }, "✅ Server listening");
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn({ signal }, "🛑 Shutdown signal received");

  // 1) Dejar de aceptar nuevas conexiones
  server.close(async (err) => {
    if (err) logger.error({ err }, "Error closing server");

    try {
      // 2) Cerrar DB (Sequelize)
      await sequelize.close();
      logger.info("✅ Sequelize closed");
    } catch (e) {
      logger.error({ err: e }, "❌ Error closing Sequelize");
    } finally {
      process.exit(0);
    }
  });

  // 3) Failsafe por si algo se queda colgado
  setTimeout(() => {
    logger.error("⏱️ Forced shutdown after timeout");
    process.exit(1);
  }, 12_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));