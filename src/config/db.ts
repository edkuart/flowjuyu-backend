// src/config/db.ts
import dotenv from "dotenv";
dotenv.config();

import { Sequelize } from "sequelize";

console.log("🔍 DB_PASSWORD:", process.env.DB_PASSWORD, typeof process.env.DB_PASSWORD);

export const sequelize = new Sequelize(
  process.env.DB_NAME || "",
  process.env.DB_USER || "",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // ⚠️ Solo para DEV. En PROD usa CA.
      },
    },
  }
);

export async function assertDbConnection() {
  try {
    await sequelize.authenticate();
    console.log("✅ DB conectada");
  } catch (err) {
    console.error("❌ Error conectando a DB:", err);
    throw err;
  }
}
