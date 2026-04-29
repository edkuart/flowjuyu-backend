import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";

export interface AdminAiCreditSummary {
  activeCredits: number;
  purchasedCredits30d: number;
  consumedCredits30d: number;
  manualGrantCredits30d: number;
  pendingPurchaseRequests: number;
}

export interface AdminAiCreditTransactionRow {
  id: string;
  seller_id: number;
  seller_email: string | null;
  seller_name: string | null;
  type: string;
  credits: number;
  balance_before: number | null;
  balance_after: number;
  description: string;
  ref_type: string | null;
  ref_id: string | null;
  created_at: Date;
}

export interface AdminAiCreditSellerRow {
  seller_id: number;
  seller_email: string | null;
  seller_name: string | null;
  ai_credits_balance: number;
  estado_admin: string | null;
  estado_validacion: string | null;
}

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAdminAiCreditSummary(): Promise<AdminAiCreditSummary> {
  const [row] = await sequelize.query<{
    active_credits: string | number | null;
    purchased_credits_30d: string | number | null;
    consumed_credits_30d: string | number | null;
    manual_grant_credits_30d: string | number | null;
    pending_purchase_requests: string | number | null;
  }>(
    `
    SELECT
      COALESCE((SELECT SUM(ai_credits_balance) FROM vendedor_perfil), 0) AS active_credits,
      COALESCE((
        SELECT SUM(credits)
        FROM ai_credit_transactions
        WHERE type = 'purchase'
          AND created_at >= NOW() - INTERVAL '30 days'
      ), 0) AS purchased_credits_30d,
      COALESCE((
        SELECT SUM(ABS(credits))
        FROM ai_credit_transactions
        WHERE type = 'debit'
          AND created_at >= NOW() - INTERVAL '30 days'
      ), 0) AS consumed_credits_30d,
      COALESCE((
        SELECT SUM(credits)
        FROM ai_credit_transactions
        WHERE type = 'manual_grant'
          AND created_at >= NOW() - INTERVAL '30 days'
      ), 0) AS manual_grant_credits_30d,
      COALESCE((
        SELECT COUNT(*)
        FROM ai_credit_purchase_requests
        WHERE status IN ('pending', 'under_review')
      ), 0) AS pending_purchase_requests
    `,
    { type: QueryTypes.SELECT },
  );

  return {
    activeCredits: toInt(row?.active_credits),
    purchasedCredits30d: toInt(row?.purchased_credits_30d),
    consumedCredits30d: toInt(row?.consumed_credits_30d),
    manualGrantCredits30d: toInt(row?.manual_grant_credits_30d),
    pendingPurchaseRequests: toInt(row?.pending_purchase_requests),
  };
}

export async function listAdminAiCreditTransactions(input: {
  sellerId?: number;
  type?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: AdminAiCreditTransactionRow[]; total: number }> {
  const where: string[] = [];
  const replacements: Record<string, unknown> = {
    limit: input.limit,
    offset: input.offset,
  };

  if (input.sellerId) {
    where.push("t.seller_id = :sellerId");
    replacements.sellerId = input.sellerId;
  }

  if (input.type) {
    where.push("t.type = :type");
    replacements.type = input.type;
  }

  if (input.search?.trim()) {
    where.push(
      "(u.correo ILIKE :search OR vp.nombre_comercio ILIKE :search OR t.description ILIKE :search OR t.ref_id ILIKE :search)",
    );
    replacements.search = `%${input.search.trim()}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow] = await sequelize.query<{ total: string }>(
    `
    SELECT COUNT(*) AS total
    FROM ai_credit_transactions t
    LEFT JOIN users u ON u.id = t.seller_id
    LEFT JOIN vendedor_perfil vp ON vp.user_id = t.seller_id
    ${whereSql}
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  const rows = await sequelize.query<AdminAiCreditTransactionRow>(
    `
    SELECT
      t.id,
      t.seller_id,
      u.correo AS seller_email,
      vp.nombre_comercio AS seller_name,
      t.type,
      t.credits,
      t.balance_before,
      t.balance_after,
      t.description,
      t.ref_type,
      t.ref_id,
      t.created_at
    FROM ai_credit_transactions t
    LEFT JOIN users u ON u.id = t.seller_id
    LEFT JOIN vendedor_perfil vp ON vp.user_id = t.seller_id
    ${whereSql}
    ORDER BY t.created_at DESC
    LIMIT :limit OFFSET :offset
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  return { rows, total: parseInt(countRow?.total ?? "0", 10) };
}

export async function searchAdminAiCreditSellers(input: {
  search?: string;
  limit: number;
}): Promise<AdminAiCreditSellerRow[]> {
  const replacements: Record<string, unknown> = { limit: input.limit };
  const clauses = ["u.rol IN ('seller', 'admin')"];

  if (input.search?.trim()) {
    const q = input.search.trim();
    const id = Number(q);
    clauses.push(
      Number.isFinite(id)
        ? "(u.id = :sellerId OR u.correo ILIKE :search OR vp.nombre_comercio ILIKE :search)"
        : "(u.correo ILIKE :search OR vp.nombre_comercio ILIKE :search)",
    );
    replacements.search = `%${q}%`;
    if (Number.isFinite(id)) replacements.sellerId = id;
  }

  return sequelize.query<AdminAiCreditSellerRow>(
    `
    SELECT
      u.id AS seller_id,
      u.correo AS seller_email,
      vp.nombre_comercio AS seller_name,
      COALESCE(vp.ai_credits_balance, 0) AS ai_credits_balance,
      vp.estado_admin,
      vp.estado_validacion
    FROM users u
    JOIN vendedor_perfil vp ON vp.user_id = u.id
    WHERE ${clauses.join(" AND ")}
    ORDER BY vp.nombre_comercio NULLS LAST, u.correo ASC
    LIMIT :limit
    `,
    { replacements, type: QueryTypes.SELECT },
  );
}
