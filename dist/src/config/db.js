"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
exports.assertDbConnection = assertDbConnection;
require("dotenv/config");
const sequelize_1 = require("sequelize");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const { NODE_ENV, DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, } = process.env;
const poolConfig = {
    max: 15,
    min: 2,
    idle: 10000,
    acquire: 30000,
    evict: 10000,
};
const commonConfig = {
    logging: NODE_ENV === "development"
        ? (msg) => console.debug("🧠 SQL:", msg)
        : false,
    pool: poolConfig,
};
const caPath = path_1.default.join(process.cwd(), "config", "supabase-ca.crt");
let sslConfig;
try {
    const caCerts = fs_1.default
        .readFileSync(caPath, "utf8")
        .split(/(?=-----BEGIN CERTIFICATE-----)/g);
    sslConfig = {
        require: true,
        rejectUnauthorized: true,
        ca: caCerts,
    };
    console.log("✅ Certificado CA cargado correctamente");
}
catch {
    console.warn("⚠️ No se encontró certificado CA. Usando SSL cifrado sin validación (fallback).");
    sslConfig = {
        require: true,
        rejectUnauthorized: false,
    };
}
exports.sequelize = DATABASE_URL
    ? new sequelize_1.Sequelize(DATABASE_URL, {
        ...commonConfig,
        dialect: "postgres",
        dialectOptions: { ssl: sslConfig },
    })
    : new sequelize_1.Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
        ...commonConfig,
        host: DB_HOST,
        port: Number(DB_PORT || 5432),
        dialect: "postgres",
        dialectOptions: { ssl: sslConfig },
    });
async function assertDbConnection() {
    try {
        await exports.sequelize.authenticate();
        console.log("✅ Conexión a PostgreSQL establecida correctamente");
    }
    catch (err) {
        console.error("❌ Error crítico conectando a DB:", err);
        process.exit(1);
    }
}
