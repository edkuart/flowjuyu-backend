// src/controllers/admin.fraud.controller.ts
//
// Admin-only endpoints for Phase 6: Financial Fraud + Review Layer.
// All routes protected by the admin router's verifyToken + requireRole("admin").

import { RequestHandler } from "express";
import { Op, literal }   from "sequelize";
import { sequelize }      from "../config/db";
import SecurityProfile    from "../models/SecurityProfile.model";
import ManualReviewCase   from "../models/ManualReviewCase.model";
import PaymentAttempt     from "../models/PaymentAttempt.model";
import Order              from "../models/Order.model";
import { logAuditEventFromRequest } from "../services/audit.service";
import {
  generateFinancialFraudSignals,
  createManualReviewCaseIfNotExists,
} from "../services/fraudIntelligence.service";
import {
  PROFILE_STATUSES,
  CASE_STATUSES,
  CASE_PRIORITIES,
} from "../config/financialPolicies";

// ─── Allowlists for input validation ─────────────────────────────────────────
const VALID_SUBJECT_TYPES  = new Set(["user", "ip", "seller"]);
const VALID_PROFILE_STATUS = new Set(PROFILE_STATUSES);
const VALID_CASE_STATUS    = new Set(CASE_STATUSES);
const VALID_CASE_PRIORITY  = new Set(CASE_PRIORITIES);

function getSingleRouteParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/* ============================================================
   GET /api/admin/security/profiles
   Paginated list of security profiles with optional filters.
============================================================ */
export const getSecurityProfiles: RequestHandler = async (req, res) => {
  try {
    const {
      subject_type,
      status,
      min_financial_risk,
      date_from,
      date_to,
      limit:  limitParam  = "50",
      offset: offsetParam = "0",
    } = req.query as Record<string, string | undefined>;

    if (subject_type && !VALID_SUBJECT_TYPES.has(subject_type)) {
      res.status(400).json({ ok: false, message: `subject_type inválido. Valores: ${[...VALID_SUBJECT_TYPES].join(", ")}` });
      return;
    }
    if (status && !VALID_PROFILE_STATUS.has(status as never)) {
      res.status(400).json({ ok: false, message: `status inválido. Valores: ${[...VALID_PROFILE_STATUS].join(", ")}` });
      return;
    }

    const limit  = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
    const offset = Math.max(Number(offsetParam) || 0, 0);
    const where: Record<string, unknown> = {};

    if (subject_type) where.subject_type = subject_type;
    if (status)       where.status       = status;

    if (min_financial_risk !== undefined) {
      const n = Number(min_financial_risk);
      if (!Number.isFinite(n)) {
        res.status(400).json({ ok: false, message: "min_financial_risk debe ser un número" });
        return;
      }
      where.financial_risk_score = { [Op.gte]: n };
    }

    if (date_from || date_to) {
      const range: Record<symbol, Date> = {};
      if (date_from) {
        const d = new Date(date_from);
        if (isNaN(d.getTime())) { res.status(400).json({ ok: false, message: "date_from inválido" }); return; }
        range[Op.gte] = d;
      }
      if (date_to) {
        const d = new Date(date_to);
        if (isNaN(d.getTime())) { res.status(400).json({ ok: false, message: "date_to inválido" }); return; }
        range[Op.lte] = d;
      }
      where.last_evaluated_at = range;
    }

    const { rows, count } = await SecurityProfile.findAndCountAll({
      where,
      order:  [["financial_risk_score", "DESC"], ["updated_at", "DESC"]],
      limit,
      offset,
    });

    res.json({ ok: true, total: count, limit, offset, data: rows });
  } catch (err) {
    console.error("getSecurityProfiles error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/admin/security/profiles/:subjectType/:subjectKey
   Single profile by subject.
============================================================ */
export const getSecurityProfile: RequestHandler = async (req, res) => {
  try {
    const subjectType = getSingleRouteParam(req.params.subjectType);
    const subjectKey  = getSingleRouteParam(req.params.subjectKey);

    if (!subjectType || !VALID_SUBJECT_TYPES.has(subjectType)) {
      res.status(400).json({ ok: false, message: "subjectType inválido" });
      return;
    }
    if (!subjectKey?.trim()) {
      res.status(400).json({ ok: false, message: "subjectKey requerido" });
      return;
    }

    const profile = await SecurityProfile.findOne({
      where: { subject_type: subjectType, subject_key: subjectKey.trim() },
    });

    if (!profile) {
      res.status(404).json({ ok: false, message: "Perfil no encontrado" });
      return;
    }

    res.json({ ok: true, data: profile });
  } catch (err) {
    console.error("getSecurityProfile error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/admin/manual-review/cases
   Paginated manual review cases with filters.
============================================================ */
export const getManualReviewCases: RequestHandler = async (req, res) => {
  try {
    const {
      status,
      priority,
      case_type,
      subject_type,
      date_from,
      date_to,
      limit:  limitParam  = "50",
      offset: offsetParam = "0",
    } = req.query as Record<string, string | undefined>;

    if (status    && !VALID_CASE_STATUS.has(status as never)) {
      res.status(400).json({ ok: false, message: `status inválido. Valores: ${[...VALID_CASE_STATUS].join(", ")}` });
      return;
    }
    if (priority  && !VALID_CASE_PRIORITY.has(priority as never)) {
      res.status(400).json({ ok: false, message: `priority inválido. Valores: ${[...VALID_CASE_PRIORITY].join(", ")}` });
      return;
    }
    if (subject_type && !VALID_SUBJECT_TYPES.has(subject_type)) {
      res.status(400).json({ ok: false, message: "subject_type inválido" });
      return;
    }

    const limit  = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
    const offset = Math.max(Number(offsetParam) || 0, 0);
    const where: Record<string, unknown> = {};

    if (status)       where.status       = status;
    if (priority)     where.priority     = priority;
    if (case_type)    where.case_type    = case_type;
    if (subject_type) where.subject_type = subject_type;

    if (date_from || date_to) {
      const range: Record<symbol, Date> = {};
      if (date_from) {
        const d = new Date(date_from);
        if (isNaN(d.getTime())) { res.status(400).json({ ok: false, message: "date_from inválido" }); return; }
        range[Op.gte] = d;
      }
      if (date_to) {
        const d = new Date(date_to);
        if (isNaN(d.getTime())) { res.status(400).json({ ok: false, message: "date_to inválido" }); return; }
        range[Op.lte] = d;
      }
      where.created_at = range;
    }

    const { rows, count } = await ManualReviewCase.findAndCountAll({
      where,
      order: [
        literal(`CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END DESC`),
        ["created_at", "DESC"],
      ],
      limit,
      offset,
    });

    res.json({ ok: true, total: count, limit, offset, data: rows });
  } catch (err) {
    console.error("getManualReviewCases error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/admin/manual-review/cases/:id/approve
   Approve a manual review case. Sets status → approved.
============================================================ */
export const approveManualReviewCase: RequestHandler = async (req, res) => {
  try {
    const caseId = Number(req.params.id);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      res.status(400).json({ ok: false, message: "caseId inválido" });
      return;
    }

    const reviewCase = await ManualReviewCase.findByPk(caseId);
    if (!reviewCase) {
      res.status(404).json({ ok: false, message: "Caso no encontrado" });
      return;
    }

    if (!["open", "in_review", "escalated"].includes(reviewCase.status)) {
      res.status(409).json({ ok: false, message: `No se puede aprobar un caso en estado "${reviewCase.status}"` });
      return;
    }

    await reviewCase.update({
      status:      "approved",
      assigned_to: req.user!.id,
      resolved_at: new Date(),
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: req.user!.id,
      actor_role:    "admin",
      action:        "admin.manual_review.case.approved",
      entity_type:   "manual_review_case",
      entity_id:     String(caseId),
      status:        "success",
      severity:      "medium",
      metadata:      { case_type: reviewCase.case_type, subject: `${reviewCase.subject_type}:${reviewCase.subject_key}` },
    });

    res.json({ ok: true, data: reviewCase });
  } catch (err) {
    console.error("approveManualReviewCase error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/admin/manual-review/cases/:id/reject
   Reject a manual review case. Sets status → rejected.
============================================================ */
export const rejectManualReviewCase: RequestHandler = async (req, res) => {
  try {
    const caseId = Number(req.params.id);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      res.status(400).json({ ok: false, message: "caseId inválido" });
      return;
    }

    const reviewCase = await ManualReviewCase.findByPk(caseId);
    if (!reviewCase) {
      res.status(404).json({ ok: false, message: "Caso no encontrado" });
      return;
    }

    if (!["open", "in_review", "escalated"].includes(reviewCase.status)) {
      res.status(409).json({ ok: false, message: `No se puede rechazar un caso en estado "${reviewCase.status}"` });
      return;
    }

    await reviewCase.update({
      status:      "rejected",
      assigned_to: req.user!.id,
      resolved_at: new Date(),
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: req.user!.id,
      actor_role:    "admin",
      action:        "admin.manual_review.case.rejected",
      entity_type:   "manual_review_case",
      entity_id:     String(caseId),
      status:        "success",
      severity:      "medium",
      metadata:      { case_type: reviewCase.case_type, subject: `${reviewCase.subject_type}:${reviewCase.subject_key}` },
    });

    res.json({ ok: true, data: reviewCase });
  } catch (err) {
    console.error("rejectManualReviewCase error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/admin/security/fraud/generate
   Trigger a full financial fraud scan.
============================================================ */
export const triggerFraudGeneration: RequestHandler = async (req, res) => {
  try {
    const result = await generateFinancialFraudSignals();

    void logAuditEventFromRequest(req, {
      actor_user_id: req.user!.id,
      actor_role:    "admin",
      action:        "admin.fraud.scan.triggered",
      status:        result.ok ? "success" : "failed",
      severity:      "medium",
      metadata:      { message: result.message },
    });

    res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    console.error("triggerFraudGeneration error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/admin/security/fraud/summary
   Overview of current fraud intelligence state.
============================================================ */
export const getFraudSummary: RequestHandler = async (req, res) => {
  try {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since24h   = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalOpenCases,
      casesCreatedToday,
      casesResolvedToday,
      flaggedProfiles,
      suspendedProfiles,
      failedAttemptsToday,
      manualReviewOrdersToday,
      topCaseTypes,
    ] = await Promise.all([
      ManualReviewCase.count({
        where: { status: { [Op.in]: ["open", "in_review", "escalated"] } },
      }),
      ManualReviewCase.count({
        where: { created_at: { [Op.gte]: todayStart } },
      }),
      ManualReviewCase.count({
        where: {
          resolved_at: { [Op.gte]: todayStart },
          status:      { [Op.in]: ["approved", "rejected"] },
        },
      }),
      SecurityProfile.count({ where: { status: "flagged" } }),
      SecurityProfile.count({ where: { status: "suspended" } }),
      PaymentAttempt.count({
        where: { status: "failed", created_at: { [Op.gte]: since24h } },
      }),
      Order.count({
        where: { status: "manual_review", created_at: { [Op.gte]: since24h } },
      }),
      // Top 5 case types by open count
      ManualReviewCase.findAll({
        where:      { status: { [Op.in]: ["open", "in_review", "escalated"] } },
        attributes: [
          "case_type",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group:  ["case_type"],
        order:  [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
        limit:  5,
        raw:    true,
      }) as unknown as Array<{ case_type: string; count: string }>,
    ]);

    res.json({
      ok:   true,
      data: {
        cases: {
          open:            totalOpenCases,
          createdToday:    casesCreatedToday,
          resolvedToday:   casesResolvedToday,
          topTypes:        topCaseTypes.map(r => ({ case_type: r.case_type, count: Number(r.count) })),
        },
        profiles: {
          flagged:   flaggedProfiles,
          suspended: suspendedProfiles,
        },
        payments: {
          failedAttemptsLast24h:    failedAttemptsToday,
          manualReviewOrdersLast24h: manualReviewOrdersToday,
        },
      },
    });
  } catch (err) {
    console.error("getFraudSummary error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};
