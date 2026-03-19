// src/controllers/notifications.controller.ts

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";

/* ============================================================
   🔔 GET NOTIFICATIONS
   GET /api/notifications
   Returns latest 50 notifications for the authenticated user
============================================================ */
export const getNotifications: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const rows = await sequelize.query<{
      id: string;
      type: string;
      title: string;
      message: string;
      link: string | null;
      is_read: boolean;
      created_at: string;
    }>(
      `
      SELECT id, type, title, message, link, is_read, created_at
      FROM notifications
      WHERE user_id = :userId
      ORDER BY created_at DESC
      LIMIT 50
      `,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    const unread_count = rows.filter((r) => !r.is_read).length;

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
