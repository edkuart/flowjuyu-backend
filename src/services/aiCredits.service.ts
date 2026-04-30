// src/services/aiCredits.service.ts
//
// Wallet operations for the AI credits system.
// All mutations are atomic: balance update + ledger entry in a single transaction.

import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import AiCreditTransaction, {
  AiCreditTransactionType,
} from "../models/AiCreditTransaction.model";

// ─── Credit cost catalog ──────────────────────────────────────────────────────

export const AI_CREDIT_COSTS = {
  content_caption: 1,
  content_description: 2,
  content_image_prompt: 1,
  canvas_ai: 5,
  canvas_ai_with_image: 11,
  video_10s_kling: 7,
  video_10s_luma: 14,
  video_10s_runway: 31,
} as const;

export type AiCreditOperation = keyof typeof AI_CREDIT_COSTS;

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InsufficientAiCreditsError extends Error {
  constructor(
    public readonly balance: number,
    public readonly required: number,
  ) {
    super(`Créditos insuficientes: tienes ${balance}, necesitas ${required}`);
    this.name = "InsufficientAiCreditsError";
  }
}

export class AiCreditsNotFoundError extends Error {
  constructor() {
    super("Perfil de vendedor no encontrado");
    this.name = "AiCreditsNotFoundError";
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAiCreditsBalance(sellerId: number): Promise<number> {
  const [row] = await sequelize.query<{ ai_credits_balance: number }>(
    `SELECT ai_credits_balance FROM vendedor_perfil WHERE user_id = :sellerId`,
    { replacements: { sellerId }, type: QueryTypes.SELECT },
  );
  if (!row) throw new AiCreditsNotFoundError();
  return row.ai_credits_balance;
}

export async function listAiCreditTransactions(
  sellerId: number,
  limit = 20,
  offset = 0,
): Promise<{ rows: AiCreditTransaction[]; total: number }> {
  const [countRow] = await sequelize.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM ai_credit_transactions WHERE seller_id = :sellerId`,
    { replacements: { sellerId }, type: QueryTypes.SELECT },
  );
  const rows = await AiCreditTransaction.findAll({
    where: { seller_id: sellerId },
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });
  return { rows, total: parseInt(countRow.total, 10) };
}

// ─── Write (atomic) ───────────────────────────────────────────────────────────

interface CreditLedgerOptions {
  sellerId: number;
  credits: number; // positive = add, negative = deduct
  type: AiCreditTransactionType;
  description: string;
  refType?: string;
  refId?: string;
}

async function writeLedgerEntry(
  opts: CreditLedgerOptions,
  txn: any,
): Promise<{ balanceAfter: number; txId: string }> {
  const [current] = await sequelize.query<{ ai_credits_balance: number }>(
    `SELECT ai_credits_balance FROM vendedor_perfil WHERE user_id = :sellerId FOR UPDATE`,
    {
      replacements: { sellerId: opts.sellerId },
      type: QueryTypes.SELECT,
      transaction: txn,
    },
  );

  if (!current) throw new AiCreditsNotFoundError();

  const balanceBefore = current.ai_credits_balance;

  if (opts.credits < 0 && balanceBefore < Math.abs(opts.credits)) {
    throw new InsufficientAiCreditsError(balanceBefore, Math.abs(opts.credits));
  }

  const sign = opts.credits < 0 ? "-" : "+";
  const abs = Math.abs(opts.credits);

  const [updated] = await sequelize.query<{ ai_credits_balance: number }>(
    `
    UPDATE vendedor_perfil
    SET ai_credits_balance = ai_credits_balance ${sign} :abs
    WHERE user_id = :sellerId
    RETURNING ai_credits_balance
    `,
    {
      replacements: { abs, sellerId: opts.sellerId },
      type: QueryTypes.SELECT,
      transaction: txn,
    },
  );

  if (!updated) throw new AiCreditsNotFoundError();

  const balanceAfter = updated.ai_credits_balance;

  const tx = await AiCreditTransaction.create(
    {
      seller_id: opts.sellerId,
      type: opts.type,
      credits: opts.credits,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: opts.description,
      ref_type: opts.refType ?? null,
      ref_id: opts.refId ?? null,
    },
    { transaction: txn },
  );

  return { balanceAfter, txId: tx.id };
}

// ── Deduct credits (fails if insufficient) ────────────────────────────────────

export async function deductAiCredits(
  sellerId: number,
  operation: AiCreditOperation,
  refType?: string,
  refId?: string,
): Promise<{ balanceAfter: number; txId: string; creditsUsed: number }> {
  const cost = AI_CREDIT_COSTS[operation];

  return sequelize.transaction(async (t) => {
    const { balanceAfter, txId } = await writeLedgerEntry(
      {
        sellerId,
        credits: -cost,
        type: "debit",
        description: `Uso de IA: ${operation.replace(/_/g, " ")}`,
        refType,
        refId,
      },
      t,
    );

    return { balanceAfter, txId, creditsUsed: cost };
  });
}

// ── Refund credits (after failed AI operation) ────────────────────────────────

export async function refundAiCredits(
  sellerId: number,
  credits: number,
  description: string,
  refType?: string,
  refId?: string,
): Promise<{ balanceAfter: number; txId: string }> {
  return sequelize.transaction(async (t) => {
    return writeLedgerEntry(
      { sellerId, credits, type: "refund", description, refType, refId },
      t,
    );
  });
}

// ── Add credits (purchase or admin grant) ─────────────────────────────────────

export async function addAiCredits(
  sellerId: number,
  credits: number,
  type: "purchase" | "manual_grant" | "plan_renewal",
  description: string,
  refType?: string,
  refId?: string,
): Promise<{ balanceAfter: number; txId: string }> {
  return sequelize.transaction(async (t) => {
    return writeLedgerEntry(
      { sellerId, credits, type, description, refType, refId },
      t,
    );
  });
}

// ─── Packages catalog ─────────────────────────────────────────────────────────

export interface AiCreditPackage {
  id: number;
  slug: string;
  name: string;
  credits: number;
  price_gtq: number;
  sort_order: number;
}

export async function listAiCreditPackages(): Promise<AiCreditPackage[]> {
  return sequelize.query<AiCreditPackage>(
    `SELECT id, slug, name, credits, price_gtq, sort_order
     FROM ai_credit_packages
     WHERE is_active = true
     ORDER BY sort_order ASC`,
    { type: QueryTypes.SELECT },
  );
}

export async function getAiCreditPackage(
  packageId: number,
): Promise<AiCreditPackage | null> {
  const [pkg] = await sequelize.query<AiCreditPackage>(
    `SELECT id, slug, name, credits, price_gtq, sort_order
     FROM ai_credit_packages
     WHERE id = :packageId AND is_active = true`,
    { replacements: { packageId }, type: QueryTypes.SELECT },
  );
  return pkg ?? null;
}

// ─── Purchase requests ────────────────────────────────────────────────────────

export interface AiCreditPurchaseRequest {
  id: string;
  seller_id: number;
  package_id: number;
  credits: number;
  price_gtq: number;
  status: "pending" | "under_review" | "approved" | "rejected";
  provider: string | null;
  provider_session_id: string | null;
  provider_transaction_id: string | null;
  payment_note: string | null;
  payment_completed_at: Date | null;
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  tx_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createPurchaseRequest(
  sellerId: number,
  packageId: number,
  paymentNote: string | null,
): Promise<AiCreditPurchaseRequest> {
  const pkg = await getAiCreditPackage(packageId);
  if (!pkg) throw new Error("Paquete de créditos no encontrado o inactivo");

  const [row] = await sequelize.query<AiCreditPurchaseRequest>(
    `
    INSERT INTO ai_credit_purchase_requests
      (seller_id, package_id, credits, price_gtq, status, payment_note)
    VALUES (:sellerId, :packageId, :credits, :priceGtq, 'pending', :paymentNote)
    RETURNING *
    `,
    {
      replacements: {
        sellerId,
        packageId,
        credits: pkg.credits,
        priceGtq: pkg.price_gtq,
        paymentNote: paymentNote ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );
  return row;
}

export async function attachProviderSessionToPurchaseRequest(
  requestId: string,
  provider: string,
  providerSessionId: string,
): Promise<AiCreditPurchaseRequest> {
  const [updated] = await sequelize.query<AiCreditPurchaseRequest>(
    `
    UPDATE ai_credit_purchase_requests
    SET provider = :provider,
        provider_session_id = :providerSessionId,
        updated_at = NOW()
    WHERE id = :requestId
    RETURNING *
    `,
    {
      replacements: { provider, providerSessionId, requestId },
      type: QueryTypes.SELECT,
    },
  );
  if (!updated) throw new Error("Solicitud de compra IA no encontrada");
  return updated;
}

export async function findPurchaseRequestByProviderSession(
  provider: string,
  providerSessionId: string,
): Promise<AiCreditPurchaseRequest | null> {
  const [row] = await sequelize.query<AiCreditPurchaseRequest>(
    `
    SELECT *
    FROM ai_credit_purchase_requests
    WHERE provider = :provider
      AND provider_session_id = :providerSessionId
    LIMIT 1
    `,
    {
      replacements: { provider, providerSessionId },
      type: QueryTypes.SELECT,
    },
  );
  return row ?? null;
}

export async function completePurchaseRequestFromProvider(input: {
  requestId: string;
  provider: string;
  providerSessionId: string;
  providerTransactionId: string | null;
}): Promise<{
  outcome: "processed" | "duplicate" | "ignored";
  detail?: string;
  balanceAfter?: number;
}> {
  return sequelize.transaction(async (t) => {
    const [req] = await sequelize.query<AiCreditPurchaseRequest>(
      `SELECT * FROM ai_credit_purchase_requests WHERE id = :requestId FOR UPDATE`,
      {
        replacements: { requestId: input.requestId },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );

    if (!req)
      return { outcome: "ignored", detail: "request_not_found" as const };
    if (
      req.provider_session_id &&
      req.provider_session_id !== input.providerSessionId &&
      req.provider_session_id !== input.requestId
    ) {
      return {
        outcome: "ignored",
        detail: "provider_session_mismatch" as const,
      };
    }
    if (req.status === "approved") return { outcome: "duplicate" };
    if (req.status === "rejected")
      return { outcome: "ignored", detail: "request_rejected" as const };

    const { balanceAfter, txId } = await writeLedgerEntry(
      {
        sellerId: req.seller_id,
        credits: req.credits,
        type: "purchase",
        description: `Compra pagada: ${req.credits} créditos IA (Q${req.price_gtq})`,
        refType: "provider_checkout",
        refId: input.providerSessionId,
      },
      t,
    );

    await sequelize.query(
      `
      UPDATE ai_credit_purchase_requests
      SET status = 'approved',
          provider = :provider,
          provider_session_id = :providerSessionId,
          provider_transaction_id = :providerTransactionId,
          payment_completed_at = NOW(),
          reviewed_at = NOW(),
          tx_id = :txId,
          updated_at = NOW()
      WHERE id = :requestId
      `,
      {
        replacements: {
          provider: input.provider,
          providerSessionId: input.providerSessionId,
          providerTransactionId: input.providerTransactionId,
          txId,
          requestId: input.requestId,
        },
        type: QueryTypes.UPDATE,
        transaction: t,
      },
    );

    return { outcome: "processed", balanceAfter };
  });
}

export async function markPurchaseRequestProviderFailed(
  provider: string,
  providerSessionId: string,
  reason: string,
): Promise<AiCreditPurchaseRequest | null> {
  const [updated] = await sequelize.query<AiCreditPurchaseRequest>(
    `
    UPDATE ai_credit_purchase_requests
    SET status = 'rejected',
        rejection_reason = :reason,
        updated_at = NOW()
    WHERE provider = :provider
      AND provider_session_id = :providerSessionId
      AND status IN ('pending', 'under_review')
    RETURNING *
    `,
    {
      replacements: { provider, providerSessionId, reason },
      type: QueryTypes.SELECT,
    },
  );
  return updated ?? null;
}

export async function cancelPurchaseRequestBySeller(input: {
  requestId: string;
  sellerId: number;
  reason: string;
}): Promise<AiCreditPurchaseRequest | null> {
  const [updated] = await sequelize.query<AiCreditPurchaseRequest>(
    `
    UPDATE ai_credit_purchase_requests
    SET status = 'rejected',
        rejection_reason = :reason,
        updated_at = NOW()
    WHERE id = :requestId
      AND seller_id = :sellerId
      AND status IN ('pending', 'under_review')
    RETURNING *
    `,
    {
      replacements: {
        requestId: input.requestId,
        sellerId: input.sellerId,
        reason: input.reason,
      },
      type: QueryTypes.SELECT,
    },
  );
  return updated ?? null;
}

export async function rejectStaleUnpaidPurchaseRequests(): Promise<number> {
  const [, affectedCount] = await sequelize.query(
    `
    UPDATE ai_credit_purchase_requests
    SET status = 'rejected',
        rejection_reason = 'Checkout expirado sin pago confirmado',
        updated_at = NOW()
    WHERE status IN ('pending', 'under_review')
      AND created_at < NOW() - INTERVAL '24 hours'
    `,
    { type: QueryTypes.UPDATE },
  );
  return Number(affectedCount) || 0;
}

export async function listPurchaseRequestsBySeller(
  sellerId: number,
  limit = 20,
  offset = 0,
): Promise<{ rows: AiCreditPurchaseRequest[]; total: number }> {
  const [countRow] = await sequelize.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM ai_credit_purchase_requests WHERE seller_id = :sellerId`,
    { replacements: { sellerId }, type: QueryTypes.SELECT },
  );
  const rows = await sequelize.query<AiCreditPurchaseRequest>(
    `
    SELECT r.*, p.name AS package_name, p.slug AS package_slug
    FROM ai_credit_purchase_requests r
    JOIN ai_credit_packages p ON p.id = r.package_id
    WHERE r.seller_id = :sellerId
    ORDER BY r.created_at DESC
    LIMIT :limit OFFSET :offset
    `,
    { replacements: { sellerId, limit, offset }, type: QueryTypes.SELECT },
  );
  return { rows, total: parseInt(countRow.total, 10) };
}

// Admin: list all pending/under_review requests
export async function listPendingPurchaseRequests(
  status?: string,
  limit = 50,
  offset = 0,
): Promise<{ rows: AiCreditPurchaseRequest[]; total: number }> {
  const allowedStatuses = new Set([
    "pending",
    "under_review",
    "approved",
    "rejected",
  ]);
  const wantsAll = status === "all";
  const normalizedStatus =
    status && allowedStatuses.has(status) ? status : undefined;
  const whereStatus = wantsAll
    ? ""
    : normalizedStatus
      ? "AND r.status = :status"
      : "AND r.status IN ('pending', 'under_review')";
  const replacements = { limit, offset, status: normalizedStatus };

  const [countRow] = await sequelize.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM ai_credit_purchase_requests r WHERE 1=1 ${whereStatus}`,
    { replacements, type: QueryTypes.SELECT },
  );
  const rows = await sequelize.query<any>(
    `
    SELECT r.*, p.name AS package_name, p.slug AS package_slug,
           u.correo AS seller_email, vp.nombre_comercio
    FROM ai_credit_purchase_requests r
    JOIN ai_credit_packages p ON p.id = r.package_id
    JOIN users u ON u.id = r.seller_id
    LEFT JOIN vendedor_perfil vp ON vp.user_id = r.seller_id
    WHERE 1=1 ${whereStatus}
    ORDER BY r.created_at DESC
    LIMIT :limit OFFSET :offset
    `,
    { replacements, type: QueryTypes.SELECT },
  );
  return { rows, total: parseInt(countRow.total, 10) };
}

export async function approvePurchaseRequest(
  requestId: string,
  adminId: number,
): Promise<{ request: AiCreditPurchaseRequest; balanceAfter: number }> {
  return sequelize.transaction(async (t) => {
    const [req] = await sequelize.query<AiCreditPurchaseRequest>(
      `SELECT * FROM ai_credit_purchase_requests WHERE id = :requestId FOR UPDATE`,
      { replacements: { requestId }, type: QueryTypes.SELECT, transaction: t },
    );
    if (!req) throw new Error("Solicitud no encontrada");
    if (req.status === "approved") throw new Error("Solicitud ya aprobada");
    if (req.status === "rejected")
      throw new Error("Solicitud ya rechazada — no se puede aprobar");

    const { balanceAfter, txId } = await writeLedgerEntry(
      {
        sellerId: req.seller_id,
        credits: req.credits,
        type: "purchase",
        description: `Compra aprobada: ${req.credits} créditos (Q${req.price_gtq})`,
        refType: "purchase_request",
        refId: requestId,
      },
      t,
    );

    const [updated] = await sequelize.query<AiCreditPurchaseRequest>(
      `
      UPDATE ai_credit_purchase_requests
      SET status = 'approved', reviewed_by = :adminId, reviewed_at = NOW(),
          tx_id = :txId, updated_at = NOW()
      WHERE id = :requestId
      RETURNING *
      `,
      {
        replacements: { adminId, txId, requestId },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );

    return { request: updated, balanceAfter };
  });
}

export async function rejectPurchaseRequest(
  requestId: string,
  adminId: number,
  reason: string,
): Promise<AiCreditPurchaseRequest> {
  if (!reason?.trim()) throw new Error("Se requiere motivo de rechazo");

  const [req] = await sequelize.query<AiCreditPurchaseRequest>(
    `SELECT status FROM ai_credit_purchase_requests WHERE id = :requestId`,
    { replacements: { requestId }, type: QueryTypes.SELECT },
  );
  if (!req) throw new Error("Solicitud no encontrada");
  if (req.status === "approved")
    throw new Error("Solicitud ya aprobada — no se puede rechazar");
  if (req.status === "rejected") throw new Error("Solicitud ya rechazada");

  const [updated] = await sequelize.query<AiCreditPurchaseRequest>(
    `
    UPDATE ai_credit_purchase_requests
    SET status = 'rejected', reviewed_by = :adminId, reviewed_at = NOW(),
        rejection_reason = :reason, updated_at = NOW()
    WHERE id = :requestId
    RETURNING *
    `,
    { replacements: { adminId, reason, requestId }, type: QueryTypes.SELECT },
  );
  return updated;
}
