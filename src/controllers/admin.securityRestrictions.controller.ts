// src/controllers/admin.securityRestrictions.controller.ts

import { RequestHandler } from "express";
import { Op } from "sequelize";
import { sequelize } from "../config/db";
import SecurityRestriction from "../models/SecurityRestriction.model";
import { expireOldRestrictions } from "../services/activeDefense.service";
import { logAuditEventFromRequest } from "../services/audit.service";

// ─── Enum allowlists for input validation ────────────────────────────────────
const VALID_STATUSES         = new Set(["active", "expired", "revoked"]);
const VALID_SUBJECT_TYPES    = new Set(["user", "ip", "seller", "admin"]);
const VALID_RESTRICTION_TYPES = new Set([
  "login_cooldown",
  "review_block",
  "kyc_block",
  "manual_review_required",
]);

export const getSecurityRestrictions: RequestHandler = async (req, res) => {
  try {
    await expireOldRestrictions();

    const {
      status,
      subject_type,
      restriction_type,
      date_from,
      date_to,
      limit:  limitParam  = "50",
      offset: offsetParam = "0",
    } = req.query as Record<string, string | undefined>;

    // Strict enum validation — return 400 for unknown values
    if (status && !VALID_STATUSES.has(status)) {
      res.status(400).json({
        ok: false,
        message: `status inválido. Valores aceptados: ${[...VALID_STATUSES].join(", ")}`,
      });
      return;
    }
    if (subject_type && !VALID_SUBJECT_TYPES.has(subject_type)) {
      res.status(400).json({
        ok: false,
        message: `subject_type inválido. Valores aceptados: ${[...VALID_SUBJECT_TYPES].join(", ")}`,
      });
      return;
    }
    if (restriction_type && !VALID_RESTRICTION_TYPES.has(restriction_type)) {
      res.status(400).json({
        ok: false,
        message: `restriction_type inválido. Valores aceptados: ${[...VALID_RESTRICTION_TYPES].join(", ")}`,
      });
      return;
    }

    const limit  = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
    const offset = Math.max(Number(offsetParam) || 0, 0);

    const where: Record<string, unknown> = {};

    if (status)           where.status           = status;
    if (subject_type)     where.subject_type     = subject_type;
    if (restriction_type) where.restriction_type = restriction_type;

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

    const { rows, count } = await SecurityRestriction.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: req.user!.id,
      actor_role:    "admin",
      action:        "admin.security.restriction.view",
      status:        "success",
      severity:      "low",
      metadata:      { filters: { status, subject_type, restriction_type }, total: count },
    });

    res.json({ ok: true, total: count, limit, offset, data: rows });
  } catch (err) {
    console.error("getSecurityRestrictions error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

export const revokeSecurityRestriction: RequestHandler = async (req, res) => {
  try {
    const restrictionId = Number(req.params.id);
    if (!Number.isFinite(restrictionId) || restrictionId <= 0) {
      res.status(400).json({ ok: false, message: "restrictionId inválido" });
      return;
    }

    const restriction = await SecurityRestriction.findByPk(restrictionId);
    if (!restriction) {
      res.status(404).json({ ok: false, message: "Restricción no encontrada" });
      return;
    }

    if (restriction.status !== "active") {
      res.status(409).json({
        ok: false,
        message: `No se puede revocar una restricción en estado "${restriction.status}"`,
      });
      return;
    }

    await restriction.update({ status: "revoked", expires_at: new Date() });

    void logAuditEventFromRequest(req, {
      actor_user_id: req.user!.id,
      actor_role:    "admin",
      action:        "admin.security.restriction.revoke.success",
      entity_type:   "security_restriction",
      entity_id:     String(restrictionId),
      status:        "success",
      severity:      "high",
      metadata:      {
        restriction_type: restriction.restriction_type,
        subject_type:     restriction.subject_type,
        subject_key:      restriction.subject_key,
      },
    });

    res.json({ ok: true, data: restriction });
  } catch (err) {
    console.error("revokeSecurityRestriction error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/admin/security/defense/summary
   Aggregated overview of active defense state.
============================================================ */
export const getDefenseSummary: RequestHandler = async (req, res) => {
  try {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since24h   = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      activeRestrictions,
      expiredToday,
      revokedToday,
      cooldownLast24h,
      denyLast24h,
      manualReviewLast24h,
    ] = await Promise.all([
      SecurityRestriction.count({
        where: {
          status:   "active",
          [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }],
        },
      }),
      // Expired today: expires_at falls within today
      SecurityRestriction.count({
        where: {
          status:     "expired",
          expires_at: { [Op.gte]: todayStart, [Op.lte]: now },
        },
      }),
      // Revoked today: expires_at was set to now() on revoke, within today
      SecurityRestriction.count({
        where: {
          status:     "revoked",
          expires_at: { [Op.gte]: todayStart },
        },
      }),
      SecurityRestriction.count({
        where: {
          restriction_type: "login_cooldown",
          created_at:       { [Op.gte]: since24h },
        },
      }),
      SecurityRestriction.count({
        where: {
          restriction_type: { [Op.in]: ["review_block", "kyc_block"] },
          created_at:       { [Op.gte]: since24h },
        },
      }),
      SecurityRestriction.count({
        where: {
          restriction_type: "manual_review_required",
          created_at:       { [Op.gte]: since24h },
        },
      }),
    ]);

    // Top subjects with most active restrictions
    const topSubjects = await SecurityRestriction.findAll({
      where: {
        status:   "active",
        [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }],
      },
      attributes: [
        "subject_type",
        "subject_key",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["subject_type", "subject_key"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
      limit: 5,
      raw:   true,
    }) as unknown as Array<{ subject_type: string; subject_key: string; count: string }>;

    res.json({
      ok:   true,
      data: {
        activeRestrictions,
        expiredToday,
        revokedToday,
        decisionsLast24h: {
          cooldown:      cooldownLast24h,
          deny:          denyLast24h,
          manual_review: manualReviewLast24h,
          // Throttle decisions do not create restrictions; not tracked in this table.
          throttle:      0,
        },
        topSubjects: topSubjects.map(s => ({
          subject_type: s.subject_type,
          subject_key:  s.subject_key,
          count:        Number(s.count),
        })),
      },
    });
  } catch (err) {
    console.error("getDefenseSummary error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

