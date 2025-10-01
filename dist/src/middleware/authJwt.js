"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function normalizeRole(raw) {
    if (!raw)
        return undefined;
    const v = String(raw).toLowerCase();
    if (["seller", "vendedor"].includes(v))
        return "seller";
    if (["buyer", "comprador"].includes(v))
        return "buyer";
    if (["admin", "administrator"].includes(v))
        return "admin";
    return undefined;
}
function requireAuth(role) {
    return (req, res, next) => {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
        if (!token) {
            res.status(401).json({ message: "No auth token" });
            return;
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "cortes_secret");
            const normalized = normalizeRole(decoded.rol || decoded.role);
            req.user = { id: Number(decoded.id), role: normalized || "buyer" };
            if (role && req.user.role !== role) {
                res.status(403).json({ message: "Forbidden" });
                return;
            }
            next();
        }
        catch (e) {
            res.status(401).json({ message: "Token inválido" });
        }
    };
}
