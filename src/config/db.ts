import "./env";
import { Sequelize } from "sequelize";
import dns from "dns";
import { Pool, type PoolConfig } from "pg";

// Prefer IPv4 when a provider returns mixed A/AAAA records.
dns.setDefaultResultOrder("ipv4first");

const isProd = process.env.NODE_ENV === "production";

type SslOptions = {
  require: true;
  rejectUnauthorized: false;
};

type ResolvedDbConfig = {
  source: "DATABASE_URL" | "DB_*";
  databaseUrl: string;
  maskedUrl: string;
  dialectOptions: {
    family: 4;
    ssl?: SslOptions;
  };
  poolConfig: PoolConfig;
};

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function hasDbParams(): boolean {
  return Boolean(
    process.env.DB_HOST?.trim() &&
      process.env.DB_PORT?.trim() &&
      process.env.DB_NAME?.trim() &&
      process.env.DB_USER?.trim() &&
      process.env.DB_PASSWORD?.trim(),
  );
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function resolveDevConnectionMode(): "url" | "params" {
  const explicitMode = process.env.DB_CONNECTION_MODE?.trim().toLowerCase();

  if (explicitMode === "url") return "url";
  if (explicitMode === "params") return "params";

  if (hasDbParams()) return "params";
  return "url";
}

function buildSslOptions() {
  if (isProd) {
    return {
      require: true as const,
      rejectUnauthorized: false as const,
    } satisfies SslOptions;
  }

  if (isTruthy(process.env.DB_SSL)) {
    return {
      require: true as const,
      rejectUnauthorized: false as const,
    } satisfies SslOptions;
  }

  return undefined;
}

function buildDatabaseUrlFromParams(): string {
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || "flowjuyu";
  const user = process.env.DB_USER || "postgres";
  const pass = process.env.DB_PASSWORD || "postgres";

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    pass,
  )}@${host}:${port}/${name}`;
}

function maskDatabaseUrl(databaseUrl: string): string {
  return databaseUrl.replace(/:([^:@]+)@/, ":***@");
}

function buildPoolConfig(
  databaseUrl: string,
  sslOptions: ReturnType<typeof buildSslOptions>,
): PoolConfig {
  return {
    connectionString: databaseUrl,
    ssl: sslOptions ?? false,
    keepAlive: true,
  };
}

function resolveDatabaseConfig(): ResolvedDbConfig {
  const sslOptions = buildSslOptions();

  if (isProd) {
    if (!hasDatabaseUrl()) {
      throw new Error("❌ DATABASE_URL is required in production environment");
    }

    const databaseUrl = process.env.DATABASE_URL!.trim();

    return {
      source: "DATABASE_URL",
      databaseUrl,
      maskedUrl: maskDatabaseUrl(databaseUrl),
      dialectOptions: {
        family: 4,
        ...(sslOptions ? { ssl: sslOptions } : {}),
      },
      poolConfig: buildPoolConfig(databaseUrl, sslOptions),
    };
  }

  const mode = resolveDevConnectionMode();

  if (mode === "params" && hasDbParams()) {
    const databaseUrl = buildDatabaseUrlFromParams();

    return {
      source: "DB_*",
      databaseUrl,
      maskedUrl: maskDatabaseUrl(databaseUrl),
      dialectOptions: {
        family: 4,
        ...(sslOptions ? { ssl: sslOptions } : {}),
      },
      poolConfig: buildPoolConfig(databaseUrl, sslOptions),
    };
  }

  if (hasDatabaseUrl()) {
    const databaseUrl = process.env.DATABASE_URL!.trim();

    return {
      source: "DATABASE_URL",
      databaseUrl,
      maskedUrl: maskDatabaseUrl(databaseUrl),
      dialectOptions: {
        family: 4,
      },
      poolConfig: buildPoolConfig(databaseUrl, undefined),
    };
  }

  const databaseUrl = buildDatabaseUrlFromParams();

  return {
    source: "DB_*",
    databaseUrl,
    maskedUrl: maskDatabaseUrl(databaseUrl),
    dialectOptions: {
      family: 4,
      ...(sslOptions ? { ssl: sslOptions } : {}),
    },
    poolConfig: buildPoolConfig(databaseUrl, sslOptions),
  };
}

const resolvedDbConfig = resolveDatabaseConfig();

export function getResolvedDbConfig(): Readonly<ResolvedDbConfig> {
  return resolvedDbConfig;
}

export const sequelize = new Sequelize(resolvedDbConfig.databaseUrl, {
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

  dialectOptions: resolvedDbConfig.dialectOptions,
});

export const sessionPool = new Pool(resolvedDbConfig.poolConfig);

export async function assertDbConnection(): Promise<void> {
  console.log("🔗 DB source:", resolvedDbConfig.source);
  console.log("🔗 DB URL resolvida:", resolvedDbConfig.maskedUrl);

  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a PostgreSQL establecida correctamente");

    const [ctxRows] = await sequelize.query(
      `SELECT current_database() AS db,
              current_schema()   AS schema,
              current_user       AS usr`,
    );
    const ctx = ctxRows[0] as { db: string; schema: string; usr: string };
    console.log(
      `📦 Conectado a → db="${ctx.db}"  schema="${ctx.schema}"  user="${ctx.usr}"`,
    );

    const [tableRows] = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = (tableRows as { tablename: string }[])
      .map((t) => t.tablename)
      .join(", ");
    console.log("📋 Tablas públicas:", names || "(ninguna)");

    const hasFavorites = (tableRows as { tablename: string }[]).some(
      (t) => t.tablename === "favorites",
    );
    if (!hasFavorites) {
      console.warn(
        "⚠️  La tabla 'favorites' NO existe en esta base de datos.\n" +
          "   Ejecuta el SQL de creación contra la misma DB que aparece arriba.",
      );
    }
  } catch (err) {
    console.error("❌ Error crítico conectando a DB:", err);
    process.exit(1);
  }
}
