// src/controllers/admin.audit.controller.ts
//
// GET /api/admin/audit-events
// Protected by the admin router's verifyToken(["admin"]) + requireRole("admin")

import { RequestHandler } from "express";
import { Op, WhereOptions } from "sequelize";
import AuditEvent from "../models/AuditEvent.model";

export const getAuditEvents: RequestHandler = async (req, res) => {
  try {
    const {
      actor_user_id,
      action,
      status,
      severity,
      entity_type,
      date_from,
      date_to,
      limit:  limitParam  = "50",
      offset: offsetParam = "0",
    } = req.query as Record<string, string | undefined>;

    const limit  = Math.min(Math.max(Number(limitParam)  || 50,  1), 200);
    const offset = Math.max(Number(offsetParam) || 0, 0);

    const where: WhereOptions = {};

    if (actor_user_id) {
      const id = Number(actor_user_id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ ok: false, message: "actor_user_id debe ser un número" });
        return;
      }
      where.actor_user_id = id;
    }

    if (action)      where.action      = action;
    if (status)      where.status      = status;
    if (severity)    where.severity    = severity;
    if (entity_type) where.entity_type = entity_type;

    if (date_from || date_to) {
      const range: Record<symbol, Date> = {};

      if (date_from) {
        const d = new Date(date_from);
        if (isNaN(d.getTime())) {
          res.status(400).json({ ok: false, message: "date_from inválido" });
          return;
        }
        range[Op.gte] = d;
      }

      if (date_to) {
        const d = new Date(date_to);
        if (isNaN(d.getTime())) {
          res.status(400).json({ ok: false, message: "date_to inválido" });
          return;
        }
        range[Op.lte] = d;
      }

      where.created_at = range;
    }

    const { rows, count } = await AuditEvent.findAndCountAll({
      where,
      order:  [["created_at", "DESC"]],
      limit,
      offset,
    });

    res.json({
      ok:    true,
      total: count,
      limit,
      offset,
      data:  rows,
    });
  } catch (err) {
    console.error("getAuditEvents error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};
