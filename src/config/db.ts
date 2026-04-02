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
    // rejectUnauthorized: true enforces CA verification.
    // Provide DB_CA_CERT (base64-encoded PEM) if your host uses a private CA.
    ssl: isProd
      ? {
          require: true,
          rejectUnauthorized: true,
          ...(process.env.DB_CA_CERT && {
            ca: Buffer.from(process.env.DB_CA_CERT, "base64").toString("utf-8"),
          }),
        }
      : undefined,

    // 🔥 Extra seguridad contra IPv6 fallback
    family: 4,
  },
});

/**
 * 🔎 Verifica conexión al iniciar servidor y emite diagnóstico completo.
 *
 * Logs emitidos:
 *  - URL de conexión (contraseña oculta)
 *  - current_database / current_schema / current_user (desde PostgreSQL)
 *  - Tablas visibles en el schema público
 *
 * Si la URL real en los logs no coincide con la que esperabas, ese es el bug.
 */
export async function assertDbConnection(): Promise<void> {
  // ── 1. Mostrar qué URL está usando realmente este proceso ───────────────
  const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ":***@");
  console.log("🔗 DB URL resolvida:", maskedUrl);

  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a PostgreSQL establecida correctamente");

    // ── 2. Confirmar base de datos, schema y usuario reales ──────────────
    const [ctxRows] = await sequelize.query(
      `SELECT current_database() AS db,
              current_schema()   AS schema,
              current_user       AS usr`
    );
    const ctx = ctxRows[0] as { db: string; schema: string; usr: string };
    console.log(`📦 Conectado a → db="${ctx.db}"  schema="${ctx.schema}"  user="${ctx.usr}"`);

    // ── 3. Listar tablas en el schema público ────────────────────────────
    const [tableRows] = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const names = (tableRows as { tablename: string }[]).map((t) => t.tablename).join(", ");
    console.log("📋 Tablas públicas:", names || "(ninguna)");

    // ── 4. Advertir si favorites no existe ──────────────────────────────
    const hasFavorites = (tableRows as { tablename: string }[]).some(
      (t) => t.tablename === "favorites"
    );
    if (!hasFavorites) {
      console.warn(
        "⚠️  La tabla 'favorites' NO existe en esta base de datos.\n" +
        "   Ejecuta el SQL de creación contra la misma DB que aparece arriba."
      );
    }
  } catch (err) {
    console.error("❌ Error crítico conectando a DB:", err);
    process.exit(1);
  }
}
