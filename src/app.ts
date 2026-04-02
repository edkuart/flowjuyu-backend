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
import adminAiRoutes from "./routes/admin.ai.routes";
import adminContentRoutes from "./routes/admin.content.routes"; // Phase 2: AI Content
import intentionRoutes from "./routes/intention.routes";
import categoriesRoutes from "./routes/categories.routes";
import reviewRoutes from "./routes/review.routes";
import favoritesRoutes from "./routes/favorites.routes";
import notificationsRoutes from "./routes/notifications.routes";
import recommendationsRoutes from "./routes/recommendations.routes";

// Phase 2 table setup
import { setupPhase2Tables } from "./utils/setupTables";

// Initialize Sequelize associations (must run before any query uses `include`)
import "./models";

// Middleware global
import { errorHandler }        from "./middleware/errorHandler";
import { multerErrorHandler }  from "./middleware/multerError.middleware";
import { httpLogger }          from "./middleware/httpLogger";
import { responseTimeLogger }  from "./middleware/responseTime";

// ===========================
// App base
// ===========================
const app: Express = express();

// Initialize Phase 2 DB tables (non-blocking)
setupPhase2Tables().catch(() => {});
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
app.use(responseTimeLogger);

// ===========================
// Compresión
// ===========================
app.use(compression());

// ===========================
// Cookies
// ===========================
app.use(cookieParser());

// ===========================
// 🌍 CORS robusto
// ===========================

const allowlist = (
  process.env.CORS_ORIGIN_ALLOWLIST ||
  "http://localhost:3000,https://www.flowjuyu.com,https://flowjuyu.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);

    if (process.env.NODE_ENV !== "production") {
      return cb(null, true);
    }

    if (allowlist.includes(origin)) {
      return cb(null, true);
    }

    // endsWith(".flowjuyu.com") misses the apex domain "https://flowjuyu.com"
    // because that string ends with "flowjuyu.com" (no leading dot).
    // Check both: subdomain pattern AND exact apex.
    if (
      origin.endsWith(".flowjuyu.com") ||
      origin === "https://flowjuyu.com" ||
      origin === "http://flowjuyu.com"
    ) {
      return cb(null, true);
    }

    console.warn("🚫 CORS blocked:", origin);
    // Use an error, not cb(null, false). With cb(null, false) the cors package
    // lets the request fall through without CORS headers — the browser then
    // sees a response with no Access-Control-Allow-Origin, which under HTTP/2
    // manifests as ERR_HTTP2_PROTOCOL_ERROR instead of a clear CORS error.
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },

  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? {
        require: true,
        rejectUnauthorized: false,
      }
    : false,
  keepAlive: true,
});

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
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      // Keep in sync with the refresh-token cookie (cookies.ts).
      // In production default to "none" so cross-domain requests include it.
      // Overridable via COOKIE_SAME_SITE env var.
      sameSite: (() => {
        const v = process.env.COOKIE_SAME_SITE;
        if (v === "none" || v === "strict" || v === "lax") return v;
        return process.env.NODE_ENV === "production" ? "none" : "lax";
      })(),
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
app.use("/api/login",        rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/auth/social",  rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/refresh",         rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));
app.use("/api/forgot-password", rateLimit({ windowMs: 60 * 60 * 1000, max: 5,  message: { ok: false, code: "RATE_LIMITED", message: "Demasiados intentos. Espera un momento." } }));

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
// 🔥 RUTAS
// ======================================================

// ===========================
// Públicas
// ===========================
app.use("/api", publicRoutes);
app.use("/api", authRoutes);
// recommendationsRoutes MUST come before productRoutes:
// productRoutes registers GET /products/:id which would match /products/recommended
// as id="recommended" before Express reaches this handler if mounted after.
app.use("/api/products", recommendationsRoutes);
app.use("/api", productRoutes);
app.use("/api", intentionRoutes);
app.use("/api/categories", categoriesRoutes);

// ===========================
// 🏛️ ADMIN
// ===========================
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminTicketRoutes);
app.use("/api/admin/ai", adminAiRoutes);
app.use("/api/admin/ai/content", adminContentRoutes); // Phase 2: AI Content Intelligence

// ===========================
// Dominio
// ===========================
app.use("/api/buyer", buyerRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/notifications", notificationsRoutes);

// ===========================
// Analytics
// ===========================
app.use("/api/analytics", analyticsRoutes);

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
