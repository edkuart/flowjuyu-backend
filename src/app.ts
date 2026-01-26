// src/app.ts
import "dotenv/config";
import express, { Express, Request, Response, RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import pgSession from "connect-pg-simple";
import path from "path";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// ===========================
// Rutas
// ===========================
import authRoutes from "./routes/auth.routes";
import buyerRoutes from "./routes/buyer.routes";
import sellerRoutes from "./routes/seller.routes";
import productRoutes from "./routes/product.routes";
import publicRoutes from "./routes/public.routes";

// Middleware global
import { errorHandler } from "./middleware/errorHandler";

// ===========================
// App base
// ===========================
const app: Express = express();
const PgSession = pgSession(session);

// ===========================
// Seguridad base
// ===========================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(cookieParser());

// ===========================
// CORS con allowlist
// ===========================
const allowlist = (
  process.env.CORS_ORIGIN_ALLOWLIST ||
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"));
    },
    credentials: true,
  })
);

// ===========================
// Parsers
// ===========================
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos (solo dev)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ===========================
// Sesiones en PostgreSQL
// ===========================
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT || 5432),
        ssl: { rejectUnauthorized: false },
      }
);

app.set("trust proxy", 1);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "sessions",
    }),
    secret: process.env.JWT_SECRET || "supersecret", // ⚠️ usar secreto fuerte en prod
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 día
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// ===========================
// Rate limiting (rutas sensibles)
// ===========================
app.use("/api/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// ===========================
// Healthcheck
// ===========================
const healthz: RequestHandler = (_req, res): void => {
  res.json({ ok: true });
};
app.get("/healthz", healthz);

// ===========================
// Rutas
// ===========================

// 🌍 Rutas públicas (Home, catálogos, destacados, etc.)
app.use("/api", publicRoutes);

// 🔐 Auth
app.use("/api", authRoutes);

// 🛒 Comprador
app.use("/api/buyer", buyerRoutes);

// 🏪 Vendedor
app.use("/api/seller", sellerRoutes);

// 📦 Productos (públicos + seller CRUD)
app.use("/api", productRoutes);

// ===========================
// 404
// ===========================
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ===========================
// Manejo global de errores
// ===========================
app.use(errorHandler);

export default app;
