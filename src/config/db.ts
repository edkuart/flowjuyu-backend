import "dotenv/config";
import { Sequelize } from "sequelize";

const { NODE_ENV, DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

const poolConfig = {
  max: 15,
  min: 2,
  idle: 10000,
  acquire: 30000,
  evict: 10000,
};

const commonConfig = {
  logging:
    NODE_ENV === "development"
      ? (msg: string) => console.debug("🧠 SQL:", msg)
      : false,
  pool: poolConfig,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
};

export const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
      ...commonConfig,
      dialect: "postgres",
    })
  : new Sequelize(DB_NAME!, DB_USER!, DB_PASSWORD!, {
      ...commonConfig,
      host: DB_HOST,
      port: Number(DB_PORT || 5432),
      dialect: "postgres",
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