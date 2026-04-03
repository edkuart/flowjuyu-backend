// src/controllers/admin.security.controller.ts
//
// Admin-only security intelligence endpoints.
// All routes are protected by the admin router's verifyToken + requireRole("admin").

import { RequestHandler } from "express";
import { Op }             from "sequelize";
import SecurityAlert      from "../models/SecurityAlert.model";
import {
  calculateUserRisk,
  calculateIpRisk,
  generateSecurityAlerts,
} from "../services/securityIntelligence.service";

/* ============================================================
   GET /api/admin/security/alerts
   Paginated list of alerts with optional filters.
============================================================ */
export const getSecurityAlerts: RequestHandler = async (req, res) => {
  try {
    const {
      status,
      severity,
      type,
      subject_type,
      date_from,
      date_to,
      limit:  limitParam  = "50",
      offset: offsetParam = "0",
    } = req.query as Record<string, string | undefined>;

    const limit  = Math.min(Math.max(Number(limitParam)  || 50,  1), 200);
    const offset = Math.max(Number(offsetParam) || 0, 0);

    const where: Record<string, unknown> = {};

    if (status)       where.status       = status;
    if (severity)     where.severity     = severity;
    if (type)         where.type         = type;
    if (subject_type) where.subject_type = subject_type;

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

    const { rows, count } = await SecurityAlert.findAndCountAll({
      where,
      order:  [["created_at", "DESC"]],
      limit,
      offset,
    });

    res.json({ ok: true, total: count, limit, offset, data: rows });
  } catch (err) {
    console.error("getSecurityAlerts error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/admin/security/risk/users/:id
   Risk score for a specific user over the last 24 hours.
============================================================ */
export const getUserRisk: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "userId inválido" });
      return;
    }

    const result = await calculateUserRisk(id);
    res.json({ ok: true, userId: id, ...result });
  } catch (err) {
    console.error("getUserRisk error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/admin/security/risk/ip/:ip
   Risk score for a specific IP address over the last 24 hours.
============================================================ */
export const getIpRisk: RequestHandler = async (req, res) => {
  try {
    const ip = req.params.ip?.trim();
    if (!ip) {
      res.status(400).json({ ok: false, message: "IP requerida" });
      return;
    }

    const result = await calculateIpRisk(ip);
    res.json({ ok: true, ip, ...result });
  } catch (err) {
    console.error("getIpRisk error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/admin/security/alerts/:id/acknowledge
   Transition alert from "open" → "acknowledged".
============================================================ */
export const acknowledgeAlert: RequestHandler = async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isFinite(alertId) || alertId <= 0) {
      res.status(400).json({ ok: false, message: "alertId inválido" });
      return;
    }

    const alert = await SecurityAlert.findByPk(alertId);
    if (!alert) {
      res.status(404).json({ ok: false, message: "Alerta no encontrada" });
      return;
    }

    if (alert.status !== "open") {
      res.status(409).json({
        ok:      false,
        message: `No se puede reconocer una alerta en estado "${alert.status}"`,
      });
      return;
    }

    await alert.update({ status: "acknowledged" });
    res.json({ ok: true, data: alert });
  } catch (err) {
    console.error("acknowledgeAlert error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/admin/security/alerts/:id/resolve
   Transition alert from "open" or "acknowledged" → "resolved".
============================================================ */
export const resolveAlert: RequestHandler = async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    if (!Number.isFinite(alertId) || alertId <= 0) {
      res.status(400).json({ ok: false, message: "alertId inválido" });
      return;
    }

    const alert = await SecurityAlert.findByPk(alertId);
    if (!alert) {
      res.status(404).json({ ok: false, message: "Alerta no encontrada" });
      return;
    }

    if (alert.status === "resolved") {
      res.status(409).json({ ok: false, message: "La alerta ya está resuelta" });
      return;
    }

    await alert.update({ status: "resolved", resolved_at: new Date() });
    res.json({ ok: true, data: alert });
  } catch (err) {
    console.error("resolveAlert error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/admin/security/alerts/generate
   Trigger a full security scan and create new alerts from
   current audit_events data.
============================================================ */
export const triggerAlertGeneration: RequestHandler = async (req, res) => {
  try {
    const result = await generateSecurityAlerts();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    console.error("triggerAlertGeneration error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};
