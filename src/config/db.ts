// src/config/db.ts
import "dotenv/config";
import { Sequelize } from "sequelize";

const isProd = process.env.NODE_ENV === "production";

/**
 * Construye la URL:
 * - Prod: usa DATABASE_URL (Railway/Render)
 * - Dev: acepta DATABASE_URL o arma una con variables sueltas
 */
function resolveDatabaseUrl(): string {
  // 1) Si ya existe, úsala
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL.trim();
  }

  // 2) En producción es obligatoria
  if (isProd) {
    throw new Error("❌ DATABASE_URL is required in production environment");
  }

  // 3) En desarrollo, arma desde variables sueltas (fallback)
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || "flowjuyu";
  const user = process.env.DB_USER || "postgres";
  const pass = process.env.DB_PASSWORD || "postgres";

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    pass
  )}@${host}:${port}/${name}`;
}

const databaseUrl = resolveDatabaseUrl();

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  pool: {
    max: 5,
    min: 0,
    idle: 10000,
    acquire: 30000,
  },
});

export async function assertDbConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a PostgreSQL establecida correctamente");
  } catch (err) {
    console.error("❌ Error crítico conectando a DB:", err);
    process.exit(1);
  }
}