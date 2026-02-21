"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpLogger = void 0;
const pino_http_1 = __importDefault(require("pino-http"));
const crypto_1 = require("crypto");
const logger_1 = require("../config/logger");
exports.httpLogger = (0, pino_http_1.default)({
    logger: logger_1.logger,
    genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const id = typeof existing === "string" && existing.trim() ? existing : (0, crypto_1.randomUUID)();
        res.setHeader("x-request-id", id);
        return id;
    },
    customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500)
            return "error";
        if (res.statusCode >= 400)
            return "warn";
        return "info";
    },
    serializers: {
        req(req) {
            return {
                id: req.id,
                method: req.method,
                url: req.url,
                remoteAddress: req.remoteAddress,
            };
        },
    },
});
