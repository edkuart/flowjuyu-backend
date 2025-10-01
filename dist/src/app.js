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
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const buyer_routes_1 = __importDefault(require("./routes/buyer.routes"));
const seller_routes_1 = __importDefault(require("./routes/seller.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use((0, cookie_parser_1.default)());
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
app.use(express_1.default.json({ limit: "2mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
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
app.set("trust proxy", 1);
app.use((0, express_session_1.default)({
    store: new PgSession({ pool, tableName: "sessions" }),
    secret: process.env.JWT_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
    },
}));
app.use("/api/login", (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/login/google", (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 20 }));
const healthz = (_req, res) => {
    res.json({ ok: true });
};
app.get("/healthz", healthz);
app.use("/api", auth_routes_1.default);
app.use("/api/buyer", buyer_routes_1.default);
app.use("/api/seller", seller_routes_1.default);
app.use("/api", product_routes_1.default);
app.use((_req, res) => {
    res.status(404).json({ message: "Not found" });
});
app.use(errorHandler_1.errorHandler);
exports.default = app;
