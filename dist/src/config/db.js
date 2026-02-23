"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
exports.assertDbConnection = assertDbConnection;
require("dotenv/config");
const sequelize_1 = require("sequelize");
const isProd = process.env.NODE_ENV === "production";
function resolveDatabaseUrl() {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
        return process.env.DATABASE_URL.trim();
    }
    if (isProd) {
        throw new Error("❌ DATABASE_URL is required in production environment");
    }
    const host = process.env.DB_HOST || "localhost";
    const port = process.env.DB_PORT || "5432";
    const name = process.env.DB_NAME || "flowjuyu";
    const user = process.env.DB_USER || "postgres";
    const pass = process.env.DB_PASSWORD || "postgres";
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}
const databaseUrl = resolveDatabaseUrl();
exports.sequelize = new sequelize_1.Sequelize(databaseUrl, {
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development"
        ? (msg) => console.debug("🧠 SQL:", msg)
        : false,
    pool: {
        max: 15,
        min: 2,
        idle: 10000,
        acquire: 30000,
        evict: 10000,
    },
    dialectOptions: isProd
        ? {
            ssl: {
                require: true,
                rejectUnauthorized: false,
            },
        }
        : {},
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
