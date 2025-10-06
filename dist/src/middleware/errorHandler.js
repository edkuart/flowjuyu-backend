"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    const status = err.status ?? 500;
    // Nunca filtres secretos ni tokens
    // Log estructurado mínimo:
    // console.error({ err: { name: err.name, message: err.message, stack: err.stack } });
    const body = {
        message: err.publicMessage || (status === 500 ? "Internal error" : err.message),
    };
    // Exponer detalles solo si no son sensibles y ayudan a cliente
    if (err.details)
        body.details = err.details;
    res.status(status).json(body);
}
