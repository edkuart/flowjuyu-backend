// src/db.ts
import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const useDsn = !!process.env.DATABASE_URL;

export const sequelize = useDsn
  ? new Sequelize(process.env.DATABASE_URL as string, {
      dialect: "postgres",
      logging: false,
      dialectOptions: { ssl: { require: true } }, // Supabase
    })
  : new Sequelize(
      process.env.DB_NAME || "postgres",
      process.env.DB_USER || "postgres",
      (process.env.DB_PASSWORD || process.env.DB_PASS || "") as string,
      {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 5432),
        dialect: "postgres",
        logging: false,
        dialectOptions: { ssl: { require: true } }, // Supabase
      }
    );

export async function assertDbConnection() {
  await sequelize.authenticate();
  console.log("✅ DB conectada");
}
