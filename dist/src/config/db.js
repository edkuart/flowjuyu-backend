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
const common = {
    logging: NODE_ENV === "development" ? console.log : false,
    pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
};
const caPath = path_1.default.join(process.cwd(), "config", "supabase-ca.crt");
let sslConfig;
try {
    const caCerts = fs_1.default.readFileSync(caPath, "utf8");
    sslConfig = {
        require: true,
        rejectUnauthorized: true,
        ca: caCerts,
    };
    console.log("✅ Certificado CA cargado:", caPath);
}
catch (err) {
    console.warn("⚠️ No se encontró certificado CA, usando fallback inseguro");
    sslConfig = {
        require: true,
        rejectUnauthorized: false,
    };
}
let sequelize;
if (DATABASE_URL) {
    exports.sequelize = sequelize = new sequelize_1.Sequelize(DATABASE_URL, {
        ...common,
        dialect: "postgres",
        dialectOptions: { ssl: sslConfig },
    });
}
else {
    exports.sequelize = sequelize = new sequelize_1.Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
        ...common,
        host: DB_HOST,
        port: Number(DB_PORT || 5432),
        dialect: "postgres",
        dialectOptions: { ssl: sslConfig },
    });
}
async function assertDbConnection() {
    try {
        await sequelize.authenticate();
        console.log("✅ Conexión a la DB establecida correctamente");
        const [result] = await sequelize.query("SELECT NOW() as now");
        console.log("⏱️ Test SELECT NOW():", result);
    }
    catch (err) {
        console.error("❌ Error conectando a DB:", err);
        console.warn("⚠️ Usando fallback inseguro (rejectUnauthorized: false)");
        if (DATABASE_URL) {
            exports.sequelize = sequelize = new sequelize_1.Sequelize(DATABASE_URL, {
                ...common,
                dialect: "postgres",
                dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
            });
        }
        else {
            exports.sequelize = sequelize = new sequelize_1.Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
                ...common,
                host: DB_HOST,
                port: Number(DB_PORT || 5432),
                dialect: "postgres",
                dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
            });
        }
        await sequelize.authenticate();
        console.log("✅ Conexión establecida en modo inseguro (solo cifrado)");
    }
}
