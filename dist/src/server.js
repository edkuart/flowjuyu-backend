"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const logger_1 = require("./config/logger");
const PORT = Number(process.env.PORT || 8800);
const server = http_1.default.createServer(app_1.default);
server.requestTimeout = 30000;
server.headersTimeout = 35000;
server.keepAliveTimeout = 65000;
server.listen(PORT, () => {
    logger_1.logger.info({ port: PORT }, "✅ Server listening");
});
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    logger_1.logger.warn({ signal }, "🛑 Shutdown signal received");
    server.close(async (err) => {
        if (err)
            logger_1.logger.error({ err }, "Error closing server");
        try {
            await db_1.sequelize.close();
            logger_1.logger.info("✅ Sequelize closed");
        }
        catch (e) {
            logger_1.logger.error({ err: e }, "❌ Error closing Sequelize");
        }
        finally {
            process.exit(0);
        }
    });
    setTimeout(() => {
        logger_1.logger.error("⏱️ Forced shutdown after timeout");
        process.exit(1);
    }, 12000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
