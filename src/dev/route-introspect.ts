// src/dev/route-introspect.ts
// Introspector robusto usando express-list-endpoints (compatible con Express 5)
import type { Express } from "express";

// El paquete no trae tipos oficiales; usamos require para evitar errores de TS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listEndpoints: (
  app: Express,
) => Array<{ path: string; methods: string[]; middlewares?: string[] }> =
  // @ts-ignore - package has no types
  require("express-list-endpoints");

export type RouteRow = { method: string; path: string; handlers: string[] };

export function dumpRoutes(app: Express): RouteRow[] {
  const eps = listEndpoints(app) || [];
  const rows: RouteRow[] = [];

  for (const e of eps) {
    const handlers = Array.isArray(e.middlewares)
      ? (e.middlewares as string[])
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
