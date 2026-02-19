// src/app.ts
import "dotenv/config";
import express, { Express, RequestHandler, ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import pgSession from "connect-pg-simple";
import path from "path";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import compression from "compression";

// ===========================
// Rutas
// ===========================
import authRoutes from "./routes/auth.routes";
import buyerRoutes from "./routes/buyer.routes";
import sellerRoutes from "./routes/seller.routes";
import productRoutes from "./routes/product.routes";
import publicRoutes from "./routes/public.routes";
import analyticsRoutes from "./routes/analytics.routes";
import adminRoutes from "./routes/admin.routes";
import adminTicketRoutes from "./routes/admin.ticket.routes";

// Middleware global
import { errorHandler } from "./middleware/errorHandler";
import { multerErrorHandler } from "./middleware/multerError.middleware";
import { httpLogger } from "./middleware/httpLogger";

// ===========================
// App base
// ===========================
const app: Express = express();
const PgSession = pgSession(session);

// ===========================
// Seguridad HTTP
// ===========================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ===========================
// Trust proxy
// ===========================
app.set("trust proxy", 1);
app.use(httpLogger);

// ===========================
// Compresión
// ===========================
app.use(compression());

// ===========================
// Cookies
// ===========================
app.use(cookieParser());

// ===========================
// CORS seguro
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

// ===========================
// Static (dev only)
// ===========================
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
}

// ===========================
// PostgreSQL Pool (Sessions)
// ===========================
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT || 5432),
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
      }
);

// Confirmar DB de sesiones
pool
  .query("SELECT current_database()")
  .then((r) => console.log("📦 SESSION DB:", r.rows[0].current_database))
  .catch((e) => console.error("Error checking session DB:", e));

// ===========================
// Sesiones
// ===========================
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "sessions",
      createTableIfMissing: true,
    }),
    secret:
      process.env.SESSION_SECRET ||
      process.env.JWT_SECRET ||
      "fallback_secret",
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

// ===========================
// Rate limiting global
// ===========================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);
app.use("/api/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// ===========================
// Healthcheck
// ===========================
const healthz: RequestHandler = (_req, res): void => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
};

app.get("/healthz", healthz);

// ======================================================
// 🔥 RUTAS (ORDEN IMPORTANTE)
// ======================================================

// ===========================
// Públicas
// ===========================
app.use("/api", publicRoutes);
app.use("/api", authRoutes);
app.use("/api", productRoutes);

// ===========================
// 🏛️ ADMIN — SIEMPRE PRIMERO
// ===========================
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminTicketRoutes);

// ===========================
// Dominio
// ===========================
app.use("/api/buyer", buyerRoutes);
app.use("/api/seller", sellerRoutes);

// ===========================
// Analytics (aislado)
// ===========================
app.use("/api/analytics", analyticsRoutes);

// ===========================
// Session debug
// ===========================
app.get("/api/session-check", (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
  });
});

// ===========================
// 404
// ===========================
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ===========================
// Error handling
// ===========================
app.use(multerErrorHandler as ErrorRequestHandler);
app.use(errorHandler);

export default app;
