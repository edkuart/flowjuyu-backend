"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
exports.assertDbConnection = assertDbConnection;
// src/config/db.ts
require("dotenv/config");
const sequelize_1 = require("sequelize");
const { NODE_ENV, DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL = "true", // en Supabase = true
 } = process.env;
const common = {
    logging: NODE_ENV === "development" ? console.log : false,
    pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
};
const ssl = DB_SSL === "true"
    ? { ssl: { require: true, rejectUnauthorized: false } } // en PROD ideal: CA válida
    : {};
let sequelize;
if (DATABASE_URL) {
    exports.sequelize = sequelize = new sequelize_1.Sequelize(DATABASE_URL, {
        ...common,
        dialect: "postgres",
        dialectOptions: ssl,
    });
}
else {
    // Validación básica (sin imprimir secretos)
    ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].forEach((k) => {
        if (!process.env[k])
            console.error(`❌ Falta variable de entorno: ${k}`);
    });
    exports.sequelize = sequelize = new sequelize_1.Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
        ...common,
        host: DB_HOST,
        port: Number(DB_PORT || 5432),
        dialect: "postgres",
        dialectOptions: ssl,
    });
}
async function assertDbConnection() {
    try {
        await sequelize.authenticate();
        if (NODE_ENV !== "test")
            console.log("✅ DB conectada");
    }
    catch (err) {
        console.error("❌ Error conectando a DB");
        throw err;
    }
}
