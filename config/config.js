// config/config.js
require("dotenv").config();

const { URL } = require("url");

let databaseUrl = process.env.DATABASE_URL;

// 💡 Fix para conflicto SCRAM + SSL con pooler
// Sequelize usa internamente `pg`, que falla con SCRAM si SSL es forzado en `require`
// Reemplazamos `sslmode=require` por `sslmode=no-verify` para handshake limpio
if (databaseUrl && databaseUrl.includes("sslmode=require")) {
  databaseUrl = databaseUrl.replace("sslmode=require", "sslmode=no-verify");
}

const common = {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // permite handshake sin verificación redundante
    },
    family: 4, // fuerza IPv4
  },
  pool: { max: 10, min: 0, idle: 10000 },
};

module.exports = {
  development: {
    ...common,
    url: databaseUrl,
  },
  production: {
    ...common,
    url: databaseUrl,
  },
};
