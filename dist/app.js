"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_session_1 = __importDefault(require("express-session"));
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
// Rutas
const auth_routes_1 = __importDefault(require("./routes/auth.routes")); // /api/login, /api/register, /api/logout, /api/session
const buyer_routes_1 = __importDefault(require("./routes/buyer.routes")); // /api/buyer/* (buyer auth)
const seller_routes_1 = __importDefault(require("./routes/seller.routes")); // /api/seller/* (seller auth)
const product_routes_1 = __importDefault(require("./routes/product.routes")); // /api/* (catálogos públicos + CRUD productos seller)
// Error handler central
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
// ===========================
// Seguridad base
// ===========================
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// Cookies (para tokens httpOnly si decides usarlos)
app.use((0, cookie_parser_1.default)());
// CORS con allowlist por ENV
const allow = (process.env.CORS_ORIGIN_ALLOWLIST ||
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin(origin, cb) {
        if (!origin || allow.includes(origin))
            return cb(null, true);
        return cb(new Error("CORS blocked"));
    },
    credentials: true,
}));
// Parsers
app.use(express_1.default.json({ limit: "2mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// Archivos estáticos (solo dev). En prod usar Supabase Storage.
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
// ===========================
// Sesiones en Postgres
// ===========================
const pool = new pg_1.Pool(process.env.DATABASE_URL
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
    });
app.set("trust proxy", 1); // si hay proxy delante (nginx/render/vercel)
app.use((0, express_session_1.default)({
    store: new PgSession({ pool, tableName: "sessions" }),
    secret: process.env.JWT_SECRET || "supersecret", // ⚠️ en prod usar secreto fuerte
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 día
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
    },
}));
// ===========================
// Rate limiting (rutas sensibles)
// ===========================
app.use("/api/login", (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 20 }));
// app.use('/api/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 })); // opcional
// ===========================
// Healthcheck básico
// ===========================
const healthz = (_req, res) => {
    res.json({ ok: true });
};
app.get("/healthz", healthz);
// ===========================
// Rutas (se mantiene /api para no romper contratos actuales)
// ===========================
app.use("/api", auth_routes_1.default);
app.use("/api/buyer", buyer_routes_1.default);
app.use("/api/seller", seller_routes_1.default);
app.use("/api", product_routes_1.default);
// 404 - Not Found
app.use((_req, res) => {
    res.status(404).json({ message: "Not found" });
});
// ===========================
// Manejo global de errores (siempre al final)
// ===========================
app.use(errorHandler_1.errorHandler);
exports.default = app;
