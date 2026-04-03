// src/services/audit.service.ts
//
// Centralized audit logging for all security-sensitive and business actions.
//
// Design rules:
//   - logAuditEvent() NEVER throws. A logging failure must never break a request.
//   - logAuditEventFromRequest() extracts all HTTP context automatically.
//   - sanitizeMetadata() strips passwords, tokens, and PII before persistence.

import type { Request } from "express";
import AuditEvent, { type AuditStatus, type AuditSeverity } from "../models/AuditEvent.model";

// ─────────────────────────────────────────────────────────────────────────────
// Sensitive field names that must never appear in audit metadata
// ─────────────────────────────────────────────────────────────────────────────
const SENSITIVE_KEYS = new Set([
  "password",
  "contraseña",
  "contrasena",
  "passwordActual",
  "passwordNueva",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "id_token",
  "authorization",
  "cookie",
  "signed_url",
  "signedUrl",
  "dpi",
  "foto_dpi_frente",
  "foto_dpi_reverso",
  "selfie_con_dpi",
  "reset_password_token",
  "reset_password_expires",
  "kyc_checklist",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Input shape for direct calls
// ─────────────────────────────────────────────────────────────────────────────
export interface AuditEventInput {
  actor_user_id?:  number | null;
  actor_role:      string;
  action:          string;
  entity_type?:    string | null;
  entity_id?:      string | null;
  target_user_id?: number | null;
  ip_address:      string;
  user_agent:      string;
  http_method:     string;
  route:           string;
  status:          AuditStatus;
  severity:        AuditSeverity;
  metadata?:       Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitize metadata — remove any key in SENSITIVE_KEYS (one level deep)
// ─────────────────────────────────────────────────────────────────────────────
export function sanitizeMetadata(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;

  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (SENSITIVE_KEYS.has(key)) continue;

    // Recursively sanitize nested objects (one additional level)
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }

  return Object.keys(clean).length > 0 ? clean : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract HTTP request context from an Express Request object
// ─────────────────────────────────────────────────────────────────────────────
export function extractRequestContext(req: Request): {
  ip_address:  string;
  user_agent:  string;
  http_method: string;
  route:       string;
} {
  // req.ip respects trust proxy setting (app.ts: "trust proxy", 1)
  const ip_address  = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const user_agent  = (req.headers["user-agent"] as string | undefined) ?? "";
  const http_method = req.method ?? "";
  // baseUrl + route path gives the full Express pattern, e.g. /api/reviews/seller/:sellerId
  const routePath   = req.route?.path ?? req.path ?? "";
  const route       = (req.baseUrl ?? "") + routePath;

  return { ip_address, user_agent, http_method, route };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core log function — fire and forget safe, never throws
// ─────────────────────────────────────────────────────────────────────────────
export async function logAuditEvent(data: AuditEventInput): Promise<void> {
  try {
    await AuditEvent.create({
      actor_user_id:  data.actor_user_id  ?? null,
      actor_role:     data.actor_role,
      action:         data.action,
      entity_type:    data.entity_type    ?? null,
      entity_id:      data.entity_id      ?? null,
      target_user_id: data.target_user_id ?? null,
      ip_address:     data.ip_address,
      user_agent:     data.user_agent,
      http_method:    data.http_method,
      route:          data.route,
      status:         data.status,
      severity:       data.severity,
      metadata:       sanitizeMetadata(data.metadata ?? null),
    });
  } catch (err) {
    // Audit failure is logged but never propagated — it must not break the
    // request that triggered it.
    console.error("[audit] Failed to persist audit event:", {
      action:  data.action,
      status:  data.status,
      error:   (err as Error)?.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper — extracts HTTP context from request automatically
// ─────────────────────────────────────────────────────────────────────────────
export async function logAuditEventFromRequest(
  req:  Request,
  data: Omit<AuditEventInput, "ip_address" | "user_agent" | "http_method" | "route">,
): Promise<void> {
  const ctx = extractRequestContext(req);
  return logAuditEvent({ ...ctx, ...data });
}
