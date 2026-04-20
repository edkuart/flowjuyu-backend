// src/controllers/notifications.controller.ts

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { addConnection, removeConnection } from "../lib/sseRegistry";

// ── SSE heartbeat interval (ms) ───────────────────────────────────────────────
// 25 s keeps the connection alive through most proxy idle-timeout defaults
// (Nginx default is 60 s). Well below the 30 s EventSource reconnect timeout.
const HEARTBEAT_MS = 25_000;

/* ============================================================
   📡 SSE STREAM
   GET /api/notifications/stream
   Opens a persistent connection for real-time push delivery.

   Auth: verifyToken middleware (applied in router) reads the
   access_token cookie — EventSource sends cookies automatically
   when { withCredentials: true } is set on the client.
============================================================ */
export const streamNotifications: RequestHandler = (req, res) => {
  const userId = (req as any).user?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ message: "No autenticado" });
    return;
  }

  // ── SSE headers ────────────────────────────────────────────────────────────
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  // Tells Nginx / other reverse proxies not to buffer this response.
  res.setHeader("X-Accel-Buffering", "no");

  // Send headers immediately — this also signals the compression middleware
  // to skip this response (text/event-stream is not in the compressible list).
  res.flushHeaders();

  // ── Register connection ────────────────────────────────────────────────────
  addConnection(userId, res);

  // ── Initial event: confirm connection to the client ───────────────────────
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  // SSE comment lines (": ...") are ignored by EventSource but keep the
  // TCP connection alive and prevent proxy timeouts.
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_MS);

  // ── Cleanup on disconnect ──────────────────────────────────────────────────
  req.on("close", () => {
    clearInterval(heartbeat);
    removeConnection(userId, res);
  });
};

/* ============================================================
   🔔 GET NOTIFICATIONS
   GET /api/notifications
   Returns latest 50 notifications for the authenticated user.
============================================================ */
export const getNotifications: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const [rows, unreadResult] = await Promise.all([
      sequelize.query<{
        id: string;
        type: string;
        title: string;
        message: string;
        link: string | null;
        is_read: boolean;
        created_at: string;
        metadata: Record<string, unknown> | null;
        actor_id: number | null;
        actor_type: string | null;
        subject_type: string | null;
        subject_id: string | null;
        is_feed_item: boolean;
        channel: string;
      }>(
        `
        SELECT id, type, title, message, link, is_read, created_at,
               metadata, actor_id, actor_type, subject_type, subject_id,
               is_feed_item, channel
        FROM   notifications
        WHERE  user_id = :userId
        ORDER  BY created_at DESC
        LIMIT  50
        `,
        { replacements: { userId }, type: QueryTypes.SELECT }
      ),
      sequelize.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM notifications WHERE user_id = :userId AND is_read = false`,
        { replacements: { userId }, type: QueryTypes.SELECT }
      ),
    ]);

    const unread_count = Number(unreadResult[0]?.count ?? 0);

    res.json({ success: true, data: rows, unread_count });
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   🔔 MARK ALL AS READ
   PATCH /api/notifications/read-all
   MUST be registered BEFORE /:id/read to avoid route collision
============================================================ */
export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    await sequelize.query(
      `UPDATE notifications SET is_read = true WHERE user_id = :userId AND is_read = false`,
      { replacements: { userId } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   🔔 MARK ONE AS READ
   PATCH /api/notifications/:id/read
============================================================ */
export const markNotificationRead: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const { id } = req.params;

    await sequelize.query(
      `UPDATE notifications SET is_read = true WHERE id = :id AND user_id = :userId`,
      { replacements: { id, userId } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("markNotificationRead error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};
