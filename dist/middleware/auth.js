"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// ----- utils -----
function getBearerToken(req) {
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer "))
        return h.slice("Bearer ".length).trim();
    const cookieTok = req.cookies?.access_token; // requiere cookie-parser si lo usas
    return cookieTok || null;
}
function normalizeRoles(payload) {
    if (Array.isArray(payload.roles) && payload.roles.length)
        return payload.roles;
    if (payload.rol)
        return [payload.rol]; // soporte legado
    return [];
}
function getUserId(payload) {
    return payload.sub ?? payload.id; // preferimos sub (estándar)
}
// (opcional) fallback a sesión si está habilitado por env
function readUserFromSession(req) {
    if (process.env.AUTH_ALLOW_SESSION_FALLBACK !== "true")
        return null;
    const sessUser = req.session?.user;
    if (!sessUser?.id)
        return null;
    return {
        id: sessUser.id,
        correo: sessUser.correo,
        roles: Array.isArray(sessUser.roles) ? sessUser.roles : [],
    };
}
// ----- core -----
const verifyToken = (roles = []) => (req, res, next) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        res.status(500).json({ message: "JWT no configurado" });
        return;
    }
    const token = getBearerToken(req);
    // 1) sin token → intenta sesión si está permitido; si no, 401
    if (!token) {
        const s = readUserFromSession(req);
        if (s?.id) {
            const userRoles = (s.roles || []);
            if (roles.length > 0 && !userRoles.some((r) => roles.includes(r))) {
                res.status(403).json({ message: "Acceso denegado por rol" });
                return;
            }
            req.user = { id: s.id, correo: s.correo, roles: userRoles };
            next();
            return;
        }
        res.status(401).json({ message: "Token no proporcionado" });
        return;
    }
    try {
        // 2) Verificación con algoritmo(s) permitidos
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
        if (roles.length > 0 && !userRoles.some((r) => roles.includes(r))) {
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
    catch {
        res.status(401).json({ message: "Token inválido o expirado" });
    }
};
exports.verifyToken = verifyToken;
exports.requireAuth = (0, exports.verifyToken)();
const requireRole = (...allowed) => (0, exports.verifyToken)(allowed);
exports.requireRole = requireRole;
