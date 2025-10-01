"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    const status = err.status ?? 500;
    const body = {
        message: err.publicMessage || (status === 500 ? "Internal error" : err.message),
    };
    if (err.details)
        body.details = err.details;
    res.status(status).json(body);
}
