"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dumpRoutes = dumpRoutes;
// El paquete no trae tipos oficiales; usamos require para evitar errores de TS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listEndpoints = 
// @ts-ignore - package has no types
require("express-list-endpoints");
function dumpRoutes(app) {
    const eps = listEndpoints(app) || [];
    const rows = [];
    for (const e of eps) {
        const handlers = Array.isArray(e.middlewares)
            ? e.middlewares
            : [];
        const methods = Array.isArray(e.methods) ? e.methods : [];
        for (const m of methods) {
            rows.push({
                method: (m || "").toUpperCase(),
                path: e.path || "",
                handlers,
            });
        }
    }
    // Ordenar para lectura estable
    rows.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
    return rows;
}
