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

const common = {
  logging: NODE_ENV === "development" ? console.log : false,
  pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
};

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
  console.log("✅ Certificado CA cargado:", caPath);
} catch {
  console.warn("⚠️ No se encontró certificado CA, usando fallback inseguro");
  sslConfig = { require: true, rejectUnauthorized: false };
}

let sequelize: Sequelize;

if (DATABASE_URL) {
  sequelize = new Sequelize(DATABASE_URL, {
    ...common,
    dialect: "postgres",
    dialectOptions: { ssl: sslConfig }, // 👈 pasa el objeto ssl directo
  });
} else {
  sequelize = new Sequelize(DB_NAME!, DB_USER!, DB_PASSWORD!, {
    ...common,
    host: DB_HOST,
    port: Number(DB_PORT || 5432),
    dialect: "postgres",
    dialectOptions: { ssl: sslConfig },
  });
}

export { sequelize };

export async function assertDbConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a la DB establecida correctamente");

    const [result] = await sequelize.query("SELECT NOW() as now");
    console.log("⏱️ Test SELECT NOW():", result);
  } catch (err) {
    console.error("❌ Error conectando a DB:", err);
    console.warn("⚠️ Reintentando con rejectUnauthorized: false");

    if (DATABASE_URL) {
      sequelize = new Sequelize(DATABASE_URL, {
        ...common,
        dialect: "postgres",
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      });
    } else {
      sequelize = new Sequelize(DB_NAME!, DB_USER!, DB_PASSWORD!, {
        ...common,
        host: DB_HOST,
        port: Number(DB_PORT || 5432),
        dialect: "postgres",
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      });
    }

    await sequelize.authenticate();
    console.log("✅ Conexión establecida en modo inseguro (solo cifrado)");
  }
}
