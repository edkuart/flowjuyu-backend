// src/config/db.ts
import "dotenv/config";
import { Sequelize } from "sequelize";
import dns from "dns";

// 🔥 FORZAR IPV4 (SOLUCIÓN DEFINITIVA WINDOWS + SUPABASE)
dns.setDefaultResultOrder("ipv4first");

const isProd = process.env.NODE_ENV === "production";

/**
 * Construye la URL:
 * - Prod: usa DATABASE_URL (Railway/Render/Supabase)
 * - Dev: acepta DATABASE_URL o arma una con variables sueltas
 */
function resolveDatabaseUrl(): string {
  // 1️⃣ Si ya existe, úsala
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL.trim();
  }

  // 2️⃣ En producción es obligatoria
  if (isProd) {
    throw new Error("❌ DATABASE_URL is required in production environment");
  }

  // 3️⃣ En desarrollo, arma desde variables sueltas (fallback)
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

  logging:
    process.env.NODE_ENV === "development"
      ? (msg: string) => console.debug("🧠 SQL:", msg)
      : false,

  pool: {
    max: 15,
    min: 2,
    idle: 10000,
    acquire: 30000,
    evict: 10000,
  },

  dialectOptions: {
    // 🔐 SSL en producción (Supabase / Railway / Render)
    ssl: isProd
      ? {
          require: true,
          rejectUnauthorized: false,
        }
      : undefined,

    // 🔥 Extra seguridad contra IPv6 fallback
    family: 4,
  },
});

/**
 * 🔎 Verifica conexión al iniciar servidor
 */
export async function assertDbConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a PostgreSQL establecida correctamente");
  } catch (err) {
    console.error("❌ Error crítico conectando a DB:", err);
    process.exit(1);
  }
}