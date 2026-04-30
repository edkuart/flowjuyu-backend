import type { RequestHandler } from "express";
import {
  addAiCredits,
  AiCreditsNotFoundError,
  rejectStaleUnpaidPurchaseRequests,
} from "../services/aiCredits.service";
import {
  getAdminAiCreditSummary,
  listAdminAiCreditTransactions,
  searchAdminAiCreditSellers,
} from "../services/adminAiCredits.service";
import { logAuditEventFromRequest } from "../services/audit.service";

const VALID_TX_TYPES = new Set([
  "purchase",
  "debit",
  "refund",
  "manual_grant",
  "plan_renewal",
]);

function parsePositiveInt(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export const getAdminAiCreditsSummary: RequestHandler = async (_req, res) => {
  await rejectStaleUnpaidPurchaseRequests();
  const summary = await getAdminAiCreditSummary();
  res.json({ ok: true, summary });
};

export const getAdminAiCreditTransactions: RequestHandler = async (
  req,
  res,
) => {
  const limit = parsePositiveInt(req.query.limit, 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const sellerId = req.query.sellerId ? Number(req.query.sellerId) : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const search =
    typeof req.query.search === "string" ? req.query.search : undefined;

  if (sellerId !== undefined && !Number.isFinite(sellerId)) {
    res.status(400).json({ ok: false, message: "sellerId debe ser numérico" });
    return;
  }

  if (type && !VALID_TX_TYPES.has(type)) {
    res
      .status(400)
      .json({ ok: false, message: "Tipo de transacción inválido" });
    return;
  }

  const { rows, total } = await listAdminAiCreditTransactions({
    sellerId,
    type,
    search,
    limit,
    offset,
  });

  res.json({ ok: true, transactions: rows, total, limit, offset });
};

export const searchAdminAiCreditsSellers: RequestHandler = async (req, res) => {
  const search =
    typeof req.query.search === "string" ? req.query.search : undefined;
  const limit = parsePositiveInt(req.query.limit, 20, 50);
  const sellers = await searchAdminAiCreditSellers({ search, limit });
  res.json({ ok: true, sellers });
};

export const grantAdminAiCredits: RequestHandler = async (req, res) => {
  const adminId = req.user!.id;
  const sellerId = Number(req.body?.sellerId);
  const credits = Number(req.body?.credits);
  const reason = String(req.body?.reason ?? "").trim();
  const category = String(req.body?.category ?? "support")
    .trim()
    .slice(0, 40);

  if (!Number.isFinite(sellerId) || sellerId <= 0) {
    res.status(400).json({ ok: false, message: "sellerId debe ser válido" });
    return;
  }

  if (!Number.isFinite(credits) || credits <= 0 || credits > 10000) {
    res.status(400).json({
      ok: false,
      message: "credits debe ser un número positivo menor o igual a 10000",
    });
    return;
  }

  if (reason.length < 8) {
    res.status(400).json({
      ok: false,
      message: "El motivo es obligatorio y debe explicar la acreditación",
    });
    return;
  }

  try {
    const { balanceAfter, txId } = await addAiCredits(
      sellerId,
      Math.floor(credits),
      "manual_grant",
      `Acreditación manual (${category}) por admin ${adminId}: ${reason}`,
      "admin_grant",
      String(adminId),
    );

    await logAuditEventFromRequest(req, {
      actor_user_id: adminId,
      actor_role: "admin",
      action: "admin.ai_credits.grant.success",
      entity_type: "ai_credit_transaction",
      entity_id: txId,
      target_user_id: sellerId,
      status: "success",
      severity: credits >= 500 ? "high" : "medium",
      metadata: {
        sellerId,
        credits: Math.floor(credits),
        category,
        reason,
        balanceAfter,
      },
    });

    res.json({
      ok: true,
      sellerId,
      credits: Math.floor(credits),
      balanceAfter,
      txId,
    });
  } catch (err) {
    await logAuditEventFromRequest(req, {
      actor_user_id: adminId,
      actor_role: "admin",
      action: "admin.ai_credits.grant.failed",
      entity_type: "seller",
      entity_id: String(sellerId),
      target_user_id: sellerId,
      status: "failed",
      severity: "medium",
      metadata: {
        sellerId,
        credits,
        category,
        reason,
        error: err instanceof Error ? err.message : "unknown",
      },
    });

    if (err instanceof AiCreditsNotFoundError) {
      res.status(404).json({ ok: false, message: err.message });
      return;
    }

    throw err;
  }
};
