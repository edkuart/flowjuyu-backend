// config/config.js
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  NODE_ENV,
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env;

// Ruta al certificado CA
const caPath = path.join(process.cwd(), "config", "supabase-ca.crt");

let sslConfig;
try {
  const caCerts = fs.readFileSync(caPath, "utf8");
  sslConfig = {
    require: true,
    rejectUnauthorized: true,
    ca: caCerts,
  };
  console.log("✅ Certificado CA cargado para sequelize-cli:", caPath);
} catch (err) {
  console.warn("⚠️ No se encontró certificado CA, usando fallback inseguro en sequelize-cli");
  sslConfig = {
    require: true,
    rejectUnauthorized: false,
  };
}

const common = {
  dialect: "postgres",
  logging: NODE_ENV === "development" ? console.log : false,
  dialectOptions: { ssl: sslConfig },
};

module.exports = {
  development: DATABASE_URL
    ? { ...common, url: DATABASE_URL }
    : {
        ...common,
        host: DB_HOST,
        port: DB_PORT || 5432,
        database: DB_NAME,
        username: DB_USER,
        password: DB_PASSWORD,
      },
  production: DATABASE_URL
    ? { ...common, url: DATABASE_URL }
    : {
        ...common,
        host: DB_HOST,
        port: DB_PORT || 5432,
        database: DB_NAME,
        username: DB_USER,
        password: DB_PASSWORD,
      },
};
