// config/config.js
require("dotenv").config();

const databaseUrl = process.env.DATABASE_URL;

const common = {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === "production"
      ? {
          require: true,
          rejectUnauthorized: false,
        }
      : false,
  },
  pool: {
    max: 10,
    min: 0,
    idle: 10000,
  },
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