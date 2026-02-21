"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_model_1 = require("../models/user.model");
function getBearerToken(req) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) {
        return header.slice(7).trim();
    }
    const cookieToken = req.cookies?.access_token;
    return cookieToken || null;
}
function getUserId(payload) {
    return payload.sub ?? payload.id;
}
const verifyToken = (rolesRequeridos = []) => {
    return async (req, res, next) => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error("❌ JWT_SECRET no configurado");
            res.status(500).json({ message: "Error interno: JWT no configurado" });
            return;
        }
        const token = getBearerToken(req);
        if (!token) {
            res.status(401).json({ message: "Token no proporcionado" });
            return;
        }
        try {
            const verifyOpts = {};
            const algs = (process.env.JWT_ALGS || "HS256")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            if (algs.length) {
                verifyOpts.algorithms = algs;
            }
            const decoded = jsonwebtoken_1.default.verify(token, secret, verifyOpts);
            const userId = decoded.sub ?? decoded.id;
            if (!userId) {
                res.status(401).json({ message: "Token inválido: sin ID" });
                return;
            }
            const user = await user_model_1.User.findByPk(userId);
            if (!user) {
                res.status(401).json({ message: "Usuario no existe" });
                return;
            }
            if (typeof decoded.token_version === "number" &&
                decoded.token_version !== user.token_version) {
                res.status(401).json({
                    message: "Sesión inválida. Inicia sesión nuevamente.",
                });
                return;
            }
            if (user.estado === "suspendido") {
                res.status(403).json({ message: "Cuenta suspendida" });
                return;
            }
            const tokenRoles = Array.isArray(decoded.roles)
                ? decoded.roles
                : decoded.rol
                    ? [decoded.rol]
                    : [];
            const dbRole = user?.rol
                ? [user.rol]
                : [];
            const userRoles = Array.from(new Set([...tokenRoles, ...dbRole]
                .map((r) => String(r).toLowerCase().trim())
                .filter(Boolean)));
            console.log("🧭 baseUrl:", req.baseUrl, "| path:", req.path, "| originalUrl:", req.originalUrl);
            console.log("🧠 rolesRequeridos:", rolesRequeridos);
            console.log("🧠 userRoles:", userRoles);
            const permitido = rolesRequeridos.length === 0 ||
                rolesRequeridos.some((r) => userRoles.includes(String(r).toLowerCase().trim()));
            if (!permitido) {
                console.warn(`🚫 Acceso denegado. Requerido: [${rolesRequeridos.join(", ")}] | Usuario: [${userRoles.join(", ")}]`);
                res.status(403).json({ message: "Acceso denegado por rol" });
                return;
            }
            req.user = {
                id: userId,
                correo: decoded.correo,
                rol: userRoles[0],
                roles: userRoles,
            };
            next();
        }
        catch (error) {
            if (error?.name === "TokenExpiredError") {
                console.warn("⏰ Token expirado");
                res.status(401).json({
                    message: "Token expirado",
                    code: "TOKEN_EXPIRED",
                });
                return;
            }
            console.error("❌ Error al verificar token:", error);
            res.status(401).json({ message: "Token inválido" });
        }
    };
};
exports.verifyToken = verifyToken;
exports.requireAuth = (0, exports.verifyToken)();
const requireRole = (...allowed) => {
    return (0, exports.verifyToken)(allowed);
};
exports.requireRole = requireRole;
