"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
console.log("🚀 SERVIDOR NUEVO ARRANCANDO 2026 🔥");
const PORT = Number(process.env.PORT || 8800);
async function bootstrap() {
    try {
        await (0, db_1.assertDbConnection)();
        app_1.default.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        });
    }
    catch (err) {
        console.error("❌ No se pudo arrancar el servidor:", err);
        process.exit(1);
    }
}
bootstrap();
