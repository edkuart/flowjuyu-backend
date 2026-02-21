"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const compression_1 = __importDefault(require("compression"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const buyer_routes_1 = __importDefault(require("./routes/buyer.routes"));
const seller_routes_1 = __importDefault(require("./routes/seller.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const public_routes_1 = __importDefault(require("./routes/public.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const admin_ticket_routes_1 = __importDefault(require("./routes/admin.ticket.routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const multerError_middleware_1 = require("./middleware/multerError.middleware");
const httpLogger_1 = require("./middleware/httpLogger");
const app = (0, express_1.default)();
const PgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.set("trust proxy", 1);
app.use(httpLogger_1.httpLogger);
app.use((0, compression_1.default)());
app.use((0, cookie_parser_1.default)());
const allowlist = (process.env.CORS_ORIGIN_ALLOWLIST ||
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin(origin, cb) {
        if (!origin || allowlist.includes(origin))
            return cb(null, true);
        return cb(new Error("CORS blocked"));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: "2mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "production") {
    app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
}
const pool = new pg_1.Pool(process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
    }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT || 5432),
        ssl: process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
    });
pool
    .query("SELECT current_database()")
    .then((r) => console.log("📦 SESSION DB:", r.rows[0].current_database))
    .catch((e) => console.error("Error checking session DB:", e));
app.use((0, express_session_1.default)({
    store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ||
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
}));
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use("/api", apiLimiter);
app.use("/api/login", (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 20 }));
const healthz = (_req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: Date.now(),
    });
};
app.get("/healthz", healthz);
app.use("/api", public_routes_1.default);
app.use("/api", auth_routes_1.default);
app.use("/api", product_routes_1.default);
app.use("/api/admin", admin_routes_1.default);
app.use("/api/admin", admin_ticket_routes_1.default);
app.use("/api/buyer", buyer_routes_1.default);
app.use("/api/seller", seller_routes_1.default);
app.use("/api/analytics", analytics_routes_1.default);
app.get("/api/session-check", (req, res) => {
    res.json({
        sessionID: req.sessionID,
        session: req.session,
    });
});
app.use((_req, res) => {
    res.status(404).json({ message: "Not found" });
});
app.use(multerError_middleware_1.multerErrorHandler);
app.use(errorHandler_1.errorHandler);
exports.default = app;
