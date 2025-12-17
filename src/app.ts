// src/app.ts
import "dotenv/config";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import pgSession from "connect-pg-simple";
import path from "path";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// =======================
// IMPORTAR RUTAS
// =======================
import authRoutes from "./routes/auth.routes";
import buyerRoutes from "./routes/buyer.routes";
import sellerRoutes from "./routes/seller.routes";
import productRoutes from "./routes/product.routes";
import publicRoutes from "./routes/public.routes";   // ✅ ESTA FALTABA

// Middleware global
import { errorHandler } from "./middleware/errorHandler";

const app: Express = express();
const PgSession = pgSession(session);

// ========================
// Seguridad
// ========================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(cookieParser());

// ========================
// CORS dinámico
// ========================
const allowlist = (
  process.env.CORS_ORIGIN_ALLOWLIST ||
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"));
    },
    credentials: true,
  })
);

// ========================
// Parsers & Archivos
// ========================
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ========================
// PostgreSQL session store
// ========================
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
    secret: process.env.JWT_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// ========================
// Rate limiting
// ========================
app.use("/api/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// ========================
// Healthcheck
// ========================
app.get("/healthz", (req: Request, res: Response) => {
  res.json({ ok: true });
});

// ========================
// RUTAS
// ========================

// ⭐ RUTAS PÚBLICAS (IMPORTANTE PARA EL HOME)
app.use("/api", publicRoutes);

// 🔐 Rutas protegidas
app.use("/api", authRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/seller", sellerRoutes);

// Productos
app.use("/api", productRoutes);

// ========================
// 404 global
// ========================
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ========================
// Manejo global de errores
// ========================
app.use(errorHandler);

export default app;
