/**
 * src/lib/sseRegistry.ts
 *
 * In-memory registry of active SSE connections.
 *
 * Design: Map<userId, Set<Response>>
 *   - Set (not array): O(1) add/delete on disconnect with no index scanning.
 *   - Multiple entries per userId: supports multiple tabs / devices.
 *
 * Single-instance constraint: this works as-is on one Node process.
 * Multi-instance deployments (load-balanced) would need a Redis Pub/Sub
 * intermediary — the event arrives on any instance but the connection lives
 * on one. Not a concern at current scale; the upgrade path is mechanical.
 */

import type { Response } from "express";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SsePushPayload {
  id:           string;
  type:         string;
  title:        string;
  message:      string;
  link:         string | null;
  is_read:      boolean;
  created_at:   string;
  metadata:     Record<string, unknown> | null;
  actor_id:     number | null;
  actor_type:   string | null;
  subject_type: string | null;
  subject_id:   string | null;
  is_feed_item: boolean;
  channel:      string;
}

// ── Registry ───────────────────────────────────────────────────────────────────

const registry = new Map<number, Set<Response>>();

export function addConnection(userId: number, res: Response): void {
  let conns = registry.get(userId);
  if (!conns) {
    conns = new Set();
    registry.set(userId, conns);
  }
  conns.add(res);
}

export function removeConnection(userId: number, res: Response): void {
  const conns = registry.get(userId);
  if (!conns) return;
  conns.delete(res);
  if (conns.size === 0) registry.delete(userId);
}

// ── Push ───────────────────────────────────────────────────────────────────────
//
// Called from createNotification() immediately after the DB INSERT succeeds.
// No-op if the user has no open connections.

export function pushToUser(userId: number, payload: SsePushPayload): void {
  const conns = registry.get(userId);
  if (!conns || conns.size === 0) return;

  const frame = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of conns) {
    try {
      res.write(frame);
      // flush() is added by the compression middleware; call it when present
      // so the SSE frame is delivered immediately rather than buffered.
      const r = res as any;
      if (typeof r.flush === "function") r.flush();
    } catch {
      // Socket already closed — the 'close' event listener will clean up.
    }
  }
}

// ── Diagnostics (optional) ─────────────────────────────────────────────────────

export function getConnectionCount(): number {
  let total = 0;
  for (const conns of registry.values()) total += conns.size;
  return total;
}
