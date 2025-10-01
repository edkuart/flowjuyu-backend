"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signJwt = signJwt;
exports.verifyJwt = verifyJwt;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function signJwt(user, opts = {}) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET no está configurado");
    }
    const payload = {
        sub: user.id,
        correo: user.correo,
        roles: user.roles,
    };
    const options = {
        expiresIn: (opts.expiresIn ??
            process.env.JWT_EXPIRES_IN ??
            "1d"),
    };
    return jsonwebtoken_1.default.sign(payload, secret, options);
}
function verifyJwt(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET no está configurado");
    }
    return jsonwebtoken_1.default.verify(token, secret);
}
