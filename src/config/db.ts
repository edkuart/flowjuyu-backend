// src/config/db.ts

import "dotenv/config";
import { Sequelize } from "sequelize";
import fs from "fs";
import path from "path";

const {
  NODE_ENV,
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env;

// ===============================
// 🔹 Pool Enterprise Config
// ===============================
const poolConfig = {
  max: 15,        // máximo conexiones simultáneas
  min: 2,         // conexiones mínimas activas
  idle: 10000,    // ms antes de liberar conexión inactiva
  acquire: 30000, // tiempo máximo esperando conexión
  evict: 10000,   // limpia conexiones inactivas
};

// ===============================
// 🔹 Logging por entorno
// ===============================
const commonConfig = {
  logging:
    NODE_ENV === "development"
      ? (msg: string) => console.debug("🧠 SQL:", msg)
      : false,
  pool: poolConfig,
};

// ===============================
// 🔹 SSL Config con CA real
// ===============================
const caPath = path.join(process.cwd(), "config", "supabase-ca.crt");

let sslConfig: any;

try {
  const caCerts = fs
    .readFileSync(caPath, "utf8")
    .split(/(?=-----BEGIN CERTIFICATE-----)/g);

  sslConfig = {
    require: true,
    rejectUnauthorized: true,
    ca: caCerts,
  };

  console.log("✅ Certificado CA cargado correctamente");
} catch {
  console.warn(
    "⚠️ No se encontró certificado CA. Usando SSL cifrado sin validación (fallback)."
  );

  sslConfig = {
    require: true,
    rejectUnauthorized: false,
  };
}

// ===============================
// 🔹 Inicialización Sequelize
// ===============================
export const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
      ...commonConfig,
      dialect: "postgres",
      dialectOptions: { ssl: sslConfig },
    })
  : new Sequelize(DB_NAME!, DB_USER!, DB_PASSWORD!, {
      ...commonConfig,
      host: DB_HOST,
      port: Number(DB_PORT || 5432),
      dialect: "postgres",
      dialectOptions: { ssl: sslConfig },
    });

// ===============================
// 🔹 Conexión segura (Fail Fast)
// ===============================
export async function assertDbConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a PostgreSQL establecida correctamente");
  } catch (err) {
    console.error("❌ Error crítico conectando a DB:", err);
    process.exit(1); // 🔥 comportamiento enterprise: morir y reiniciar
  }
}
