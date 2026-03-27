// src/middleware/responseTime.ts
// Phase 1/2 performance instrumentation — logs structured response times to stdout.

import { Request, Response, NextFunction } from "express";

const PERF_LOGS_ENABLED = process.env.ENABLE_PERF_LOGS === "true";

/** Extracts the route group from a URL path: "/api/products/123" → "/api/products" */
function routeGroup(url: string): string {
  // Take up to the first 3 path segments (e.g. /api/products) and drop query string
  const path = url.split("?")[0];
  const parts = path.split("/").filter(Boolean).slice(0, 2);
  return "/" + parts.join("/");
}

export function responseTimeLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    if (!PERF_LOGS_ENABLED) return;
    const ms    = (Number(process.hrtime.bigint() - start) / 1_000_000).toFixed(2);
    const group = routeGroup(req.originalUrl);
    console.log(`🟢 [${req.method}] ${req.originalUrl} (group: ${group}) - ${ms}ms`);
  });

  next();
}
