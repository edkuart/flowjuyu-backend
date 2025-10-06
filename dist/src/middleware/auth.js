"use strict";
// src/middleware/auth.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// ──────────────────────────────
// 🧩 Utilidades
// ──────────────────────────────
function getBearerToken(req) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer "))
        return header.slice("Bearer ".length).trim();
    const cookieToken = req.cookies?.access_token;
    return cookieToken || null;
}
function normalizeRoles(payload) {
    const roles = new Set();
    if (Array.isArray(payload.roles)) {
        payload.roles.forEach((r) => roles.add(r));
    }
    else if (payload.rol) {
        roles.add(payload.rol);
    }
    // 🔄 Normalización inglés/español
    const normalized = Array.from(roles).map((r) => {
        if (r === "seller")
            return "vendedor";
        if (r === "buyer")
            return "comprador";
        return r;
    });
    return normalized;
}
function getUserId(payload) {
    return payload.sub ?? payload.id;
}
function readUserFromSession(req) {
    if (process.env.AUTH_ALLOW_SESSION_FALLBACK !== "true")
        return null;
    const s = req.session?.user;
    if (!s?.id)
        return null;
    return {
        id: s.id,
        correo: s.correo,
        roles: Array.isArray(s.roles) ? s.roles : [],
    };
}
// ──────────────────────────────
// 🔐 Middleware principal
// ──────────────────────────────
const verifyToken = (roles = []) => (req, res, next) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        res.status(500).json({ message: "JWT no configurado" });
        return;
    }
    const token = getBearerToken(req);
    if (!token) {
        const session = readUserFromSession(req);
        if (session?.id) {
            req.user = session;
            next();
            return;
        }
        res.status(401).json({ message: "Token no proporcionado" });
        return;
    }
    try {
        const verifyOpts = {};
        const algs = (process.env.JWT_ALGS || "HS256")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (algs.length)
            verifyOpts.algorithms = algs;
        const decoded = jsonwebtoken_1.default.verify(token, secret, verifyOpts);
        const userId = getUserId(decoded);
        if (!userId) {
            res.status(401).json({ message: "Token inválido (sin subject)" });
            return;
        }
        const userRoles = normalizeRoles(decoded);
        const hasRole = roles.length === 0 || userRoles.some((r) => roles.includes(r));
        if (!hasRole) {
            res.status(403).json({ message: "Acceso denegado por rol" });
            return;
        }
        req.user = {
            id: userId,
            correo: decoded.correo,
            roles: userRoles,
        };
        next();
    }
    catch (err) {
        console.error("Error al verificar token:", err);
        res.status(401).json({ message: "Token inválido o expirado" });
    }
};
exports.verifyToken = verifyToken;
// ──────────────────────────────
// 🌐 Normalizador de roles rutas
// ──────────────────────────────
function normalizeRoleName(role) {
    switch (role.toLowerCase()) {
        case "seller":
            return "vendedor";
        case "buyer":
            return "comprador";
        default:
            return role.toLowerCase();
    }
}
// ──────────────────────────────
// 🧱 Middlewares exportados
// ──────────────────────────────
exports.requireAuth = (0, exports.verifyToken)();
const requireRole = (...allowed) => {
    const normalizedAllowed = allowed.map(normalizeRoleName);
    return (0, exports.verifyToken)(normalizedAllowed);
};
exports.requireRole = requireRole;
