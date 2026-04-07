// src/services/review.service.ts
//
// Single source of truth for review business logic.
//
// Rules:
//   - validateReviewEligibility  → enforces purchase-before-review
//   - recalculateProductRating   → ALL rating updates go through here (SQL only, no JS math)
//   - create/edit/delete/hide/restore/respond/report flows live here
//
// No controller should calculate rating averages or mutate review state directly.

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../config/db";
import SecurityAlert from "../models/SecurityAlert.model";
import { logAuditEvent } from "./audit.service";

export const REVIEW_EDIT_WINDOW_MINUTES = 30;
export const REVIEW_MAX_EDITS = 1;
export const REVIEW_FLAG_RISK_THRESHOLD = 0.75;

export type EligibilityReason = "no_purchase" | "already_reviewed";
export type ReviewStatus = "published" | "hidden_by_admin" | "flagged" | "deleted";
export type ProductReviewSort = "newest" | "highest_rating" | "lowest_rating" | "most_helpful";

export interface EligibilityResult {
  eligible:      boolean;
  order_item_id: number | null;
  order_id:      number | null;
  reason?:       EligibilityReason;
}

export interface RatingStats {
  rating_avg:   number;
  rating_count: number;
}

export interface SellerResponsePayload {
  id:         number;
  review_id:  string;
  seller_id:  number;
  respuesta:  string;
  created_at: string;
  updated_at: string;
}

export interface ReviewSignalPayload {
  id:            number;
  review_id:     string;
  risk_score:    number;
  trust_score:   number;
  quality_score: number;
  signals:       Record<string, unknown>;
  created_at:    string;
  updated_at:    string;
}

export interface ReviewView {
  id:                string;
  producto_id:       string;
  product_id:        string;
  producto_nombre:   string | null;
  product_nombre:    string | null;
  rating:            number;
  comentario:        string | null;
  comment:           string | null;
  estado:            ReviewStatus;
  buyer_id:          number;
  buyer_nombre:      string;
  verified_purchase: boolean;
  order_date:        string | null;
  created_at:        string;
  updated_at:        string | null;
  helpful_count:     number;
  can_edit?:         boolean;
  can_delete?:       boolean;
  seller_response:   SellerResponsePayload | null;
  review_signal:     ReviewSignalPayload | null;
}

interface ProductReviewListResult {
  rating_avg:      number;
  rating_count:    number;
  breakdown:       Record<string, number>;
  reviews:         ReviewView[];
}

interface SellerRatingSummary {
  rating:        number;
  total_reviews: number;
}

interface CreateReviewInput {
  buyerId:     number;
  productId:   string;
  rating:      number;
  comentario?: string | null;
  transaction?: Transaction;
}

interface UpdateReviewInput {
  reviewId:    string;
  buyerId:     number;
  rating:      number;
  comentario?: string | null;
}

interface SellerResponseInput {
  reviewId:   string;
  sellerId:   number;
  respuesta:  string;
}

interface ReportReviewInput {
  reviewId: string;
  userId:   number;
  motivo:   string;
}

interface VoteReviewInput {
  reviewId: string;
  userId:   number;
}

interface AdminListReviewsInput {
  limit:       number;
  offset:      number;
  estado?:     ReviewStatus;
  highRisk?:   boolean;
  minReports?: number;
}

interface ProductContext {
  product_id:   string;
  seller_id:    number;
  product_name: string | null;
}

interface SellerReviewInsights {
  rating_avg: number;
  rating_distribution: Record<string, number>;
  total_reviews: number;
  recent_reviews_count: number;
  low_rating_count: number;
  top_products_by_reviews: Array<{
    product_id: string;
    producto_nombre: string;
    review_count: number;
    rating_avg: number;
  }>;
  frequent_terms: Array<{
    term: string;
    count: number;
  }>;
}

interface BuyerPendingReview {
  order_id: number;
  order_item_id: number;
  product_id: string;
  product_name: string;
  seller_id: number;
  order_date: string;
}

function normalizeComment(comentario?: string | null): string | null {
  if (typeof comentario !== "string") return null;

  const trimmed = comentario.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clamp01(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function mapReviewRow(row: any): ReviewView {
  return {
    id:                row.id,
    producto_id:       row.producto_id,
    product_id:        row.producto_id,
    producto_nombre:   row.producto_nombre ?? null,
    product_nombre:    row.producto_nombre ?? null,
    rating:            Number(row.rating),
    comentario:        row.comentario ?? null,
    comment:           row.comentario ?? null,
    estado:            row.estado,
    buyer_id:          Number(row.buyer_id),
    buyer_nombre:      row.buyer_nombre ?? "Comprador",
    verified_purchase: Boolean(row.verified_purchase),
    order_date:        row.order_date ?? null,
    created_at:        row.created_at,
    updated_at:        row.updated_at ?? null,
    helpful_count:     Number(row.helpful_count ?? 0),
    can_edit:          typeof row.can_edit === "boolean" ? row.can_edit : undefined,
    can_delete:        typeof row.can_delete === "boolean" ? row.can_delete : undefined,
    seller_response:   row.response_id
      ? {
          id:         Number(row.response_id),
          review_id:  row.id,
          seller_id:  Number(row.response_seller_id),
          respuesta:  row.respuesta,
          created_at: row.response_created_at,
          updated_at: row.response_updated_at,
        }
      : null,
    review_signal:     row.signal_id
      ? {
          id:            Number(row.signal_id),
          review_id:     row.id,
          risk_score:    Number(row.risk_score ?? 0),
          trust_score:   Number(row.trust_score ?? 0),
          quality_score: Number(row.quality_score ?? 0),
          signals:       row.signal_payload ?? {},
          created_at:    row.signal_created_at,
          updated_at:    row.signal_updated_at,
        }
      : null,
  };
}

function buildReviewOrderBy(sort: ProductReviewSort): string {
  switch (sort) {
    case "highest_rating":
      return "r.rating DESC, COALESCE(votes.helpful_count, 0) DESC, r.created_at DESC";
    case "lowest_rating":
      return "r.rating ASC, COALESCE(votes.helpful_count, 0) DESC, r.created_at DESC";
    case "most_helpful":
      return `
        COALESCE(votes.helpful_count, 0) DESC,
        COALESCE(rs.quality_score, 0) DESC,
        COALESCE(rs.trust_score, 0) DESC,
        r.created_at DESC
      `;
    case "newest":
    default:
      return "r.created_at DESC";
  }
}

async function getReviewProductContext(
  reviewId: string,
  transaction?: Transaction,
): Promise<ProductContext | null> {
  const [row] = await sequelize.query<ProductContext>(
    `
    SELECT
      r.producto_id::text AS product_id,
      p.vendedor_id       AS seller_id,
      p.nombre            AS product_name
    FROM reviews r
    JOIN productos p ON p.id = r.producto_id
    WHERE r.id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId },
      type:         QueryTypes.SELECT,
      transaction,
    }
  );

  return row ?? null;
}

async function maybeCreateReviewSecurityAlert(
  reviewId: string,
  buyerId: number,
  riskScore: number,
  signals: Record<string, unknown>,
): Promise<void> {
  if (riskScore <= REVIEW_FLAG_RISK_THRESHOLD) return;

  try {
    const [existing] = await sequelize.query<{ id: number }>(
      `
      SELECT id
      FROM security_alerts
      WHERE type         = 'review_suspicious_activity'
        AND subject_type = 'review'
        AND subject_key  = :reviewId
        AND status      IN ('open', 'acknowledged')
      LIMIT 1
      `,
      {
        replacements: { reviewId },
        type:         QueryTypes.SELECT,
      }
    );

    if (!existing) {
      await SecurityAlert.create({
        type:         "review_suspicious_activity",
        severity:     riskScore >= 0.9 ? "high" : "medium",
        subject_type: "review",
        subject_key:  reviewId,
        status:       "open",
        title:        `Suspicious review activity detected on review ${reviewId}`,
        description:  `Review ${reviewId} exceeded the configured risk threshold.`,
        metadata:     { buyer_id: buyerId, risk_score: riskScore, signals },
      });
    }

    await logAuditEvent({
      actor_user_id: buyerId,
      actor_role:    "system",
      action:        "review_suspicious_activity",
      entity_type:   "review",
      entity_id:     reviewId,
      target_user_id: null,
      ip_address:    "system",
      user_agent:    "system",
      http_method:   "SYSTEM",
      route:         "review.service.analyzeReviewSignals",
      status:        "success",
      severity:      riskScore >= 0.9 ? "high" : "medium",
      metadata:      { risk_score: riskScore, signals },
    });
  } catch (error) {
    console.error("[review.service] maybeCreateReviewSecurityAlert error:", error);
  }
}

export async function validateReviewEligibility(
  buyerId:   number,
  productId: string,
): Promise<EligibilityResult> {
  const [unreviewedItem] = await sequelize.query<{
    order_item_id: number;
    order_id:      number;
  }>(
    `
    SELECT oi.id AS order_item_id, o.id AS order_id
    FROM   order_items oi
    JOIN   orders o ON o.id = oi.order_id
    WHERE  oi.product_id = :productId
      AND  o.buyer_id    = :buyerId
      AND  o.status      IN ('completed', 'fulfilled')
      AND  NOT EXISTS (
             SELECT 1 FROM reviews r
             WHERE  r.order_item_id = oi.id
               AND  r.estado       <> 'deleted'
           )
    ORDER BY o.created_at DESC
    LIMIT 1
    `,
    {
      replacements: { productId, buyerId },
      type:         QueryTypes.SELECT,
    }
  );

  if (unreviewedItem) {
    return {
      eligible:      true,
      order_item_id: unreviewedItem.order_item_id,
      order_id:      unreviewedItem.order_id,
    };
  }

  const [anyOrder] = await sequelize.query<{ id: number }>(
    `
    SELECT oi.id
    FROM   order_items oi
    JOIN   orders o ON o.id = oi.order_id
    WHERE  oi.product_id = :productId
      AND  o.buyer_id    = :buyerId
      AND  o.status      IN ('completed', 'fulfilled')
    LIMIT 1
    `,
    {
      replacements: { productId, buyerId },
      type:         QueryTypes.SELECT,
    }
  );

  if (anyOrder) {
    return { eligible: false, order_item_id: null, order_id: null, reason: "already_reviewed" };
  }

  const [legacyReview] = await sequelize.query<{ id: string }>(
    `
    SELECT id
    FROM reviews
    WHERE producto_id    = :productId
      AND buyer_id       = :buyerId
      AND order_item_id IS NULL
      AND estado        <> 'deleted'
    LIMIT 1
    `,
    {
      replacements: { productId, buyerId },
      type:         QueryTypes.SELECT,
    }
  );

  if (legacyReview) {
    return { eligible: false, order_item_id: null, order_id: null, reason: "already_reviewed" };
  }

  return { eligible: false, order_item_id: null, order_id: null, reason: "no_purchase" };
}

export async function listBuyerPendingReviews(buyerId: number): Promise<BuyerPendingReview[]> {
  return sequelize.query<BuyerPendingReview>(
    `
    SELECT
      o.id                         AS order_id,
      oi.id                        AS order_item_id,
      oi.product_id::text          AS product_id,
      COALESCE(oi.product_name_snapshot, p.nombre, 'Producto') AS product_name,
      o.seller_id                  AS seller_id,
      o.created_at                 AS order_date
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN productos p ON p.id = oi.product_id
    WHERE o.buyer_id = :buyerId
      AND o.status   IN ('completed', 'fulfilled')
      AND NOT EXISTS (
        SELECT 1 FROM reviews r
        WHERE r.order_item_id = oi.id
          AND r.estado       <> 'deleted'
      )
    ORDER BY o.created_at DESC
    `,
    {
      replacements: { buyerId },
      type:         QueryTypes.SELECT,
    }
  );
}

export async function recalculateProductRating(
  productId: string,
  t?: Transaction,
): Promise<RatingStats> {
  const [stats] = await sequelize.query<{ total: number; promedio: string }>(
    `
    SELECT
      COUNT(*)::int                                AS total,
      COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS promedio
    FROM reviews
    WHERE producto_id = :productId
      AND estado      = 'published'
    `,
    {
      replacements: { productId },
      type:         QueryTypes.SELECT,
      transaction:  t,
    }
  );

  const rating_count = stats?.total ?? 0;
  const rating_avg = Number(stats?.promedio ?? 0);

  await sequelize.query(
    `
    UPDATE productos
    SET    rating_avg   = :rating_avg,
           rating_count = :rating_count,
           updated_at   = NOW()
    WHERE  id = :productId
    `,
    {
      replacements: { productId, rating_avg, rating_count },
      transaction:  t,
    }
  );

  return { rating_avg, rating_count };
}

export async function getHelpfulVoteCount(reviewId: string, transaction?: Transaction): Promise<number> {
  const [row] = await sequelize.query<{ helpful_count: number }>(
    `
    SELECT COUNT(*)::int AS helpful_count
    FROM review_votes
    WHERE review_id = :reviewId
    `,
    {
      replacements: { reviewId },
      type:         QueryTypes.SELECT,
      transaction,
    }
  );

  return Number(row?.helpful_count ?? 0);
}

export async function analyzeReviewSignals(
  reviewId: string,
  transaction?: Transaction,
): Promise<ReviewSignalPayload | null> {
  const [review] = await sequelize.query<any>(
    `
    SELECT
      r.id,
      r.producto_id::text,
      r.buyer_id,
      r.rating,
      r.comentario,
      r.estado,
      r.order_id,
      r.created_at,
      (SELECT COUNT(*)::int FROM review_reports rr WHERE rr.review_id = r.id) AS report_count,
      EXISTS (SELECT 1 FROM review_responses rsp WHERE rsp.review_id = r.id)  AS has_seller_response,
      (SELECT COUNT(*)::int
         FROM reviews bx
        WHERE bx.buyer_id = r.buyer_id
          AND bx.estado  <> 'deleted'
          AND bx.created_at >= NOW() - INTERVAL '24 hours'
      ) AS buyer_reviews_last_24h,
      (SELECT COUNT(*)::int
         FROM reviews bx
        WHERE bx.buyer_id = r.buyer_id
          AND bx.estado  <> 'deleted'
          AND bx.created_at >= NOW() - INTERVAL '7 days'
      ) AS buyer_reviews_last_7d
    FROM reviews r
    WHERE r.id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId },
      type:         QueryTypes.SELECT,
      transaction,
    }
  );

  if (!review) return null;

  const commentLength = String(review.comentario ?? "").trim().length;
  const comment_length_score = clamp01(Math.min(commentLength / 200, 1));
  const rating_extreme = [1, 5].includes(Number(review.rating));
  const buyer_review_frequency = {
    last_24h: Number(review.buyer_reviews_last_24h ?? 0),
    last_7d:  Number(review.buyer_reviews_last_7d ?? 0),
  };
  const report_count = Number(review.report_count ?? 0);
  const has_seller_response = Boolean(review.has_seller_response);
  const helpful_count = await getHelpfulVoteCount(reviewId, transaction);
  const verified_purchase = Boolean(review.order_id);

  const freq24_norm = clamp01(buyer_review_frequency.last_24h / 4);
  const freq7_norm = clamp01(buyer_review_frequency.last_7d / 10);
  const report_norm = clamp01(report_count / 3);
  const short_comment_penalty = clamp01(1 - comment_length_score);
  const extreme_norm = rating_extreme ? 1 : 0;

  const risk_score = clamp01(
    (0.28 * freq24_norm) +
    (0.22 * freq7_norm) +
    (0.22 * report_norm) +
    (0.18 * short_comment_penalty) +
    (0.10 * extreme_norm)
  );

  const trust_score = clamp01(
    (verified_purchase ? 0.45 : 0) +
    (0.20 * (1 - freq24_norm)) +
    (0.10 * (1 - freq7_norm)) +
    (0.15 * (has_seller_response ? 1 : 0)) +
    (0.10 * (1 - report_norm))
  );

  const quality_score = clamp01(
    (0.55 * comment_length_score) +
    (0.15 * (rating_extreme ? 0.45 : 1)) +
    (0.10 * (has_seller_response ? 1 : 0)) +
    (0.10 * (1 - report_norm)) +
    (0.10 * clamp01(helpful_count / 5))
  );

  const signals = {
    comment_length: commentLength,
    comment_length_score,
    rating_extreme,
    buyer_review_frequency,
    report_count,
    has_seller_response,
    helpful_count,
    verified_purchase,
  };

  const [saved] = await sequelize.query<any>(
    `
    INSERT INTO review_signals
      (review_id, risk_score, trust_score, quality_score, signals, created_at, updated_at)
    VALUES
      (:reviewId, :riskScore, :trustScore, :qualityScore, CAST(:signals AS jsonb), NOW(), NOW())
    ON CONFLICT (review_id)
    DO UPDATE SET
      risk_score    = EXCLUDED.risk_score,
      trust_score   = EXCLUDED.trust_score,
      quality_score = EXCLUDED.quality_score,
      signals       = EXCLUDED.signals,
      updated_at    = NOW()
    RETURNING id, review_id, risk_score, trust_score, quality_score, signals, created_at, updated_at
    `,
    {
      replacements: {
        reviewId,
        riskScore: risk_score,
        trustScore: trust_score,
        qualityScore: quality_score,
        signals: JSON.stringify(signals),
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  if (risk_score > REVIEW_FLAG_RISK_THRESHOLD && review.estado === "published") {
    await sequelize.query(
      `
      UPDATE reviews
      SET estado     = 'flagged',
          updated_at = NOW()
      WHERE id = :reviewId
        AND estado = 'published'
      `,
      {
        replacements: { reviewId },
        transaction,
      }
    );

    await recalculateProductRating(review.producto_id, transaction);
    await maybeCreateReviewSecurityAlert(reviewId, Number(review.buyer_id), risk_score, signals);
  }

  return {
    id:            Number(saved.id),
    review_id:     saved.review_id,
    risk_score:    Number(saved.risk_score),
    trust_score:   Number(saved.trust_score),
    quality_score: Number(saved.quality_score),
    signals:       saved.signals ?? {},
    created_at:    saved.created_at,
    updated_at:    saved.updated_at,
  };
}

export async function createReviewFromPurchase(input: CreateReviewInput): Promise<{
  review_id:     string;
  product_id:    string;
  seller_id:     number;
  rating_avg:    number;
  rating_count:  number;
  order_id:      number;
  order_item_id: number;
}> {
  const t = input.transaction ?? await sequelize.transaction();
  const ownsTransaction = !input.transaction;

  try {
    const [productCheck] = await sequelize.query<{
      id: string;
      vendedor_id: number;
    }>(
      `
      SELECT p.id, p.vendedor_id
      FROM   productos p
      JOIN   vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE  p.id = :productId
        AND  p.activo            = true
        AND  v.estado_validacion = 'aprobado'
        AND  v.estado_admin      = 'activo'
      LIMIT 1
      `,
      {
        replacements: { productId: input.productId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      }
    );

    if (!productCheck) {
      throw new Error("PRODUCT_NOT_REVIEWABLE");
    }

    const eligibility = await validateReviewEligibility(input.buyerId, input.productId);
    if (!eligibility.eligible || !eligibility.order_id || !eligibility.order_item_id) {
      throw new Error(eligibility.reason === "already_reviewed" ? "ALREADY_REVIEWED" : "PURCHASE_REQUIRED");
    }

    const [inserted] = await sequelize.query<{ id: string }>(
      `
      INSERT INTO reviews
        (producto_id, buyer_id, rating, comentario, order_id, order_item_id, estado, review_edit_count, updated_at)
      VALUES
        (:productId, :buyerId, :rating, :comentario, :orderId, :orderItemId, 'published', 0, NOW())
      RETURNING id
      `,
      {
        replacements: {
          productId:   input.productId,
          buyerId:     input.buyerId,
          rating:      input.rating,
          comentario:  normalizeComment(input.comentario),
          orderId:     eligibility.order_id,
          orderItemId: eligibility.order_item_id,
        },
        type:        QueryTypes.SELECT,
        transaction: t,
      }
    );

    const { rating_avg, rating_count } = await recalculateProductRating(input.productId, t);
    await analyzeReviewSignals(inserted.id, t);

    if (ownsTransaction) await t.commit();

    return {
      review_id:     inserted.id,
      product_id:    input.productId,
      seller_id:     Number(productCheck.vendedor_id),
      rating_avg,
      rating_count,
      order_id:      eligibility.order_id,
      order_item_id: eligibility.order_item_id,
    };
  } catch (error) {
    if (ownsTransaction) await t.rollback();
    throw error;
  }
}

export async function listProductReviews(
  productId: string,
  sort: ProductReviewSort = "newest",
): Promise<ProductReviewListResult> {
  const [productStats] = await sequelize.query<{ rating_avg: string; rating_count: number }>(
    `
    SELECT
      COALESCE(rating_avg, 0)::text AS rating_avg,
      COALESCE(rating_count, 0)::int AS rating_count
    FROM productos
    WHERE id = :productId
    LIMIT 1
    `,
    {
      replacements: { productId },
      type:         QueryTypes.SELECT,
    }
  );

  const orderBy = buildReviewOrderBy(sort);

  const rows = await sequelize.query<any>(
    `
    SELECT
      r.id,
      r.producto_id::text,
      p.nombre                                           AS producto_nombre,
      r.rating,
      r.comentario,
      r.estado,
      r.buyer_id,
      COALESCE(u.nombre, 'Comprador')                    AS buyer_nombre,
      (r.order_id IS NOT NULL)                           AS verified_purchase,
      o.created_at                                       AS order_date,
      r.created_at,
      r.updated_at,
      COALESCE(votes.helpful_count, 0)                   AS helpful_count,
      rr.id                                              AS response_id,
      rr.seller_id                                       AS response_seller_id,
      rr.respuesta,
      rr.created_at                                      AS response_created_at,
      rr.updated_at                                      AS response_updated_at,
      rs.id                                              AS signal_id,
      rs.risk_score,
      rs.trust_score,
      rs.quality_score,
      rs.signals                                         AS signal_payload,
      rs.created_at                                      AS signal_created_at,
      rs.updated_at                                      AS signal_updated_at
    FROM reviews r
    JOIN productos p       ON p.id       = r.producto_id
    JOIN vendedor_perfil v ON v.user_id  = p.vendedor_id
    LEFT JOIN users u      ON u.id       = r.buyer_id
    LEFT JOIN orders o     ON o.id       = r.order_id
    LEFT JOIN review_responses rr ON rr.review_id = r.id
    LEFT JOIN review_signals rs   ON rs.review_id = r.id
    LEFT JOIN (
      SELECT review_id, COUNT(*)::int AS helpful_count
      FROM review_votes
      GROUP BY review_id
    ) votes ON votes.review_id = r.id
    WHERE r.producto_id = :productId
      AND r.estado      = 'published'
      AND p.activo      = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin      = 'activo'
    ORDER BY ${orderBy}
    `,
    {
      replacements: { productId },
      type:         QueryTypes.SELECT,
    }
  );

  const breakdownRows = await sequelize.query<{ rating: number; total: number }>(
    `
    SELECT rating, COUNT(*)::int AS total
    FROM reviews
    WHERE producto_id = :productId
      AND estado      = 'published'
    GROUP BY rating
    `,
    {
      replacements: { productId },
      type:         QueryTypes.SELECT,
    }
  );

  const rating_count = Number(productStats?.rating_count ?? 0);
  const rating_avg = Number(productStats?.rating_avg ?? 0);

  const breakdown: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const row of breakdownRows) {
    breakdown[String(row.rating)] = Number(row.total);
  }

  return {
    rating_avg,
    rating_count,
    breakdown,
    reviews: rows.map(mapReviewRow),
  };
}

export async function getSellerRatingSummary(sellerId: number): Promise<SellerRatingSummary> {
  const [result] = await sequelize.query<{ rating: string; total_reviews: string }>(
    `
    SELECT
      COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS rating,
      COUNT(r.id)                                   AS total_reviews
    FROM reviews r
    JOIN productos p ON p.id = r.producto_id
    WHERE p.vendedor_id = :sellerId
      AND r.estado      = 'published'
    `,
    {
      replacements: { sellerId },
      type:         QueryTypes.SELECT,
    }
  );

  return {
    rating:        Number(result?.rating ?? 0),
    total_reviews: Number(result?.total_reviews ?? 0),
  };
}

export async function listSellerReviews(
  sellerId: number,
  limit: number,
  offset: number,
): Promise<ReviewView[]> {
  const rows = await sequelize.query<any>(
    `
    SELECT
      r.id,
      r.producto_id::text,
      p.nombre                                           AS producto_nombre,
      r.rating,
      r.comentario,
      r.estado,
      r.buyer_id,
      COALESCE(u.nombre, 'Comprador')                    AS buyer_nombre,
      (r.order_id IS NOT NULL)                           AS verified_purchase,
      o.created_at                                       AS order_date,
      r.created_at,
      r.updated_at,
      COALESCE(votes.helpful_count, 0)                   AS helpful_count,
      rr.id                                              AS response_id,
      rr.seller_id                                       AS response_seller_id,
      rr.respuesta,
      rr.created_at                                      AS response_created_at,
      rr.updated_at                                      AS response_updated_at,
      rs.id                                              AS signal_id,
      rs.risk_score,
      rs.trust_score,
      rs.quality_score,
      rs.signals                                         AS signal_payload,
      rs.created_at                                      AS signal_created_at,
      rs.updated_at                                      AS signal_updated_at
    FROM reviews r
    JOIN productos p        ON p.id = r.producto_id
    LEFT JOIN users u       ON u.id = r.buyer_id
    LEFT JOIN orders o      ON o.id = r.order_id
    LEFT JOIN review_responses rr ON rr.review_id = r.id
    LEFT JOIN review_signals rs   ON rs.review_id = r.id
    LEFT JOIN (
      SELECT review_id, COUNT(*)::int AS helpful_count
      FROM review_votes
      GROUP BY review_id
    ) votes ON votes.review_id = r.id
    WHERE p.vendedor_id = :sellerId
      AND r.estado      = 'published'
    ORDER BY r.created_at DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements: { sellerId, limit, offset },
      type:         QueryTypes.SELECT,
    }
  );

  return rows.map(mapReviewRow);
}

export async function listBuyerReviews(buyerId: number): Promise<ReviewView[]> {
  const rows = await sequelize.query<any>(
    `
    SELECT
      r.id,
      r.producto_id::text,
      COALESCE(oi.product_name_snapshot, p.nombre, 'Producto eliminado') AS producto_nombre,
      r.rating,
      r.comentario,
      r.estado,
      r.buyer_id,
      COALESCE(u.nombre, 'Comprador')                    AS buyer_nombre,
      (r.order_id IS NOT NULL)                           AS verified_purchase,
      o.created_at                                       AS order_date,
      r.created_at,
      r.updated_at,
      COALESCE(votes.helpful_count, 0)                   AS helpful_count,
      (
        r.estado = 'published'
        AND r.review_edit_count < :maxEdits
        AND r.created_at >= NOW() - (:windowLiteral)::interval
      )                                                  AS can_edit,
      (r.estado <> 'deleted')                            AS can_delete,
      rr.id                                              AS response_id,
      rr.seller_id                                       AS response_seller_id,
      rr.respuesta,
      rr.created_at                                      AS response_created_at,
      rr.updated_at                                      AS response_updated_at,
      rs.id                                              AS signal_id,
      rs.risk_score,
      rs.trust_score,
      rs.quality_score,
      rs.signals                                         AS signal_payload,
      rs.created_at                                      AS signal_created_at,
      rs.updated_at                                      AS signal_updated_at
    FROM reviews r
    LEFT JOIN order_items oi ON oi.id = r.order_item_id
    LEFT JOIN productos p    ON p.id  = r.producto_id
    LEFT JOIN users u        ON u.id  = r.buyer_id
    LEFT JOIN orders o       ON o.id  = r.order_id
    LEFT JOIN review_responses rr ON rr.review_id = r.id
    LEFT JOIN review_signals rs   ON rs.review_id = r.id
    LEFT JOIN (
      SELECT review_id, COUNT(*)::int AS helpful_count
      FROM review_votes
      GROUP BY review_id
    ) votes ON votes.review_id = r.id
    WHERE r.buyer_id = :buyerId
    ORDER BY r.created_at DESC
    `,
    {
      replacements: {
        buyerId,
        maxEdits: REVIEW_MAX_EDITS,
        windowLiteral: `${REVIEW_EDIT_WINDOW_MINUTES} minutes`,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map(mapReviewRow);
}

export async function getReviewResponse(reviewId: string): Promise<SellerResponsePayload | null> {
  const [row] = await sequelize.query<SellerResponsePayload>(
    `
    SELECT id, review_id, seller_id, respuesta, created_at, updated_at
    FROM review_responses
    WHERE review_id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId },
      type:         QueryTypes.SELECT,
    }
  );

  return row ?? null;
}

export async function upsertSellerResponse(input: SellerResponseInput): Promise<SellerResponsePayload> {
  const context = await getReviewProductContext(input.reviewId);

  if (!context) {
    throw new Error("REVIEW_NOT_FOUND");
  }

  if (context.seller_id !== input.sellerId) {
    throw new Error("SELLER_NOT_OWNER");
  }

  const respuesta = normalizeComment(input.respuesta);
  if (!respuesta) {
    throw new Error("RESPONSE_REQUIRED");
  }

  const [row] = await sequelize.query<SellerResponsePayload>(
    `
    INSERT INTO review_responses (review_id, seller_id, respuesta, created_at, updated_at)
    VALUES (:reviewId, :sellerId, :respuesta, NOW(), NOW())
    ON CONFLICT (review_id)
    DO UPDATE SET
      respuesta  = EXCLUDED.respuesta,
      seller_id  = EXCLUDED.seller_id,
      updated_at = NOW()
    RETURNING id, review_id, seller_id, respuesta, created_at, updated_at
    `,
    {
      replacements: {
        reviewId:  input.reviewId,
        sellerId:  input.sellerId,
        respuesta,
      },
      type: QueryTypes.SELECT,
    }
  );

  await analyzeReviewSignals(input.reviewId);
  return row;
}

export async function addHelpfulVote(input: VoteReviewInput): Promise<{ helpful_count: number }> {
  const [review] = await sequelize.query<{ id: string; buyer_id: number; estado: ReviewStatus }>(
    `
    SELECT id, buyer_id, estado
    FROM reviews
    WHERE id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId: input.reviewId },
      type:         QueryTypes.SELECT,
    }
  );

  if (!review) throw new Error("REVIEW_NOT_FOUND");
  if (review.estado !== "published") throw new Error("REVIEW_NOT_VOTABLE");
  if (Number(review.buyer_id) === input.userId) throw new Error("REVIEW_SELF_VOTE_NOT_ALLOWED");

  try {
    await sequelize.query(
      `
      INSERT INTO review_votes (review_id, user_id, created_at)
      VALUES (:reviewId, :userId, NOW())
      `,
      {
        replacements: {
          reviewId: input.reviewId,
          userId:   input.userId,
        },
      }
    );
  } catch (error: any) {
    if (error?.parent?.code === "23505") {
      throw new Error("REVIEW_ALREADY_VOTED");
    }
    throw error;
  }

  return { helpful_count: await getHelpfulVoteCount(input.reviewId) };
}

export async function removeHelpfulVote(input: VoteReviewInput): Promise<{ helpful_count: number }> {
  const [review] = await sequelize.query<{ id: string }>(
    `
    SELECT id
    FROM reviews
    WHERE id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId: input.reviewId },
      type:         QueryTypes.SELECT,
    }
  );

  if (!review) throw new Error("REVIEW_NOT_FOUND");

  const [deleted] = await sequelize.query<{ id: number }>(
    `
    DELETE FROM review_votes
    WHERE review_id = :reviewId
      AND user_id   = :userId
    RETURNING id
    `,
    {
      replacements: {
        reviewId: input.reviewId,
        userId:   input.userId,
      },
      type: QueryTypes.SELECT,
    }
  );

  if (!deleted) {
    throw new Error("REVIEW_VOTE_NOT_FOUND");
  }

  return { helpful_count: await getHelpfulVoteCount(input.reviewId) };
}

export async function updateReview(input: UpdateReviewInput): Promise<{
  review: ReviewView;
  rating_avg: number;
  rating_count: number;
}> {
  const t = await sequelize.transaction();

  try {
    const [review] = await sequelize.query<any>(
      `
      SELECT id, producto_id::text AS producto_id, buyer_id, estado, created_at, review_edit_count
      FROM reviews
      WHERE id = :reviewId
      LIMIT 1
      `,
      {
        replacements: { reviewId: input.reviewId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      }
    );

    if (!review) {
      throw new Error("REVIEW_NOT_FOUND");
    }

    if (Number(review.buyer_id) !== input.buyerId) {
      throw new Error("REVIEW_NOT_OWNER");
    }

    if (review.estado !== "published") {
      throw new Error("REVIEW_NOT_EDITABLE");
    }

    const [editability] = await sequelize.query<{ can_edit: boolean }>(
      `
      SELECT (
        review_edit_count < :maxEdits
        AND created_at >= NOW() - (:windowLiteral)::interval
      ) AS can_edit
      FROM reviews
      WHERE id = :reviewId
      LIMIT 1
      `,
      {
        replacements: {
          reviewId: input.reviewId,
          maxEdits: REVIEW_MAX_EDITS,
          windowLiteral: `${REVIEW_EDIT_WINDOW_MINUTES} minutes`,
        },
        type:        QueryTypes.SELECT,
        transaction: t,
      }
    );

    if (!editability?.can_edit) {
      throw new Error("REVIEW_EDIT_WINDOW_EXPIRED");
    }

    await sequelize.query(
      `
      UPDATE reviews
      SET rating            = :rating,
          comentario        = :comentario,
          review_edit_count = review_edit_count + 1,
          updated_at        = NOW()
      WHERE id = :reviewId
      `,
      {
        replacements: {
          reviewId:    input.reviewId,
          rating:      input.rating,
          comentario:  normalizeComment(input.comentario),
        },
        transaction: t,
      }
    );

    const ratingStats = await recalculateProductRating(review.producto_id, t);
    await analyzeReviewSignals(input.reviewId, t);
    const refreshed = await getReviewById(input.reviewId, t);

    await t.commit();

    return {
      review: refreshed!,
      rating_avg: ratingStats.rating_avg,
      rating_count: ratingStats.rating_count,
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function softDeleteReview(reviewId: string, buyerId: number): Promise<RatingStats> {
  const t = await sequelize.transaction();

  try {
    const [review] = await sequelize.query<{ producto_id: string; buyer_id: number; estado: ReviewStatus }>(
      `
      SELECT producto_id::text AS producto_id, buyer_id, estado
      FROM reviews
      WHERE id = :reviewId
      LIMIT 1
      `,
      {
        replacements: { reviewId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      }
    );

    if (!review) {
      throw new Error("REVIEW_NOT_FOUND");
    }

    if (Number(review.buyer_id) !== buyerId) {
      throw new Error("REVIEW_NOT_OWNER");
    }

    if (review.estado === "deleted") {
      throw new Error("REVIEW_ALREADY_DELETED");
    }

    await sequelize.query(
      `
      UPDATE reviews
      SET estado     = 'deleted',
          deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = :reviewId
      `,
      {
        replacements: { reviewId },
        transaction:  t,
      }
    );

    const stats = await recalculateProductRating(review.producto_id, t);
    await t.commit();
    return stats;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function reportReview(input: ReportReviewInput): Promise<void> {
  const [review] = await sequelize.query<{ id: string; buyer_id: number; seller_id: number }>(
    `
    SELECT
      r.id,
      r.buyer_id,
      p.vendedor_id AS seller_id
    FROM reviews r
    JOIN productos p ON p.id = r.producto_id
    WHERE r.id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId: input.reviewId },
      type:         QueryTypes.SELECT,
    }
  );

  if (!review) {
    throw new Error("REVIEW_NOT_FOUND");
  }

  if (![Number(review.buyer_id), Number(review.seller_id)].includes(input.userId)) {
    throw new Error("REPORT_NOT_ALLOWED");
  }

  const motivo = normalizeComment(input.motivo);
  if (!motivo) {
    throw new Error("REPORT_REASON_REQUIRED");
  }

  try {
    await sequelize.query(
      `
      INSERT INTO review_reports (review_id, user_id, motivo, created_at)
      VALUES (:reviewId, :userId, :motivo, NOW())
      `,
      {
        replacements: {
          reviewId: input.reviewId,
          userId:   input.userId,
          motivo,
        },
      }
    );
  } catch (error: any) {
    if (error?.parent?.code === "23505") {
      throw new Error("REVIEW_ALREADY_REPORTED");
    }
    throw error;
  }

  await analyzeReviewSignals(input.reviewId);
}

export async function listAdminReviews(input: AdminListReviewsInput): Promise<{
  total: number;
  reviews: Array<ReviewView & {
    seller_id: number;
    seller_nombre: string;
    report_count: number;
  }>;
}> {
  const whereClauses = [
    "1 = 1",
    input.estado ? "r.estado = :estado" : null,
    input.highRisk ? "COALESCE(rs.risk_score, 0) >= :highRiskThreshold" : null,
    typeof input.minReports === "number" && input.minReports > 0 ? "COALESCE(report_counts.total_reports, 0) >= :minReports" : null,
  ].filter(Boolean).join(" AND ");

  const rows = await sequelize.query<any>(
    `
    SELECT
      r.id,
      r.producto_id::text,
      p.nombre                                           AS producto_nombre,
      r.rating,
      r.comentario,
      r.estado,
      r.buyer_id,
      COALESCE(bu.nombre, 'Comprador')                   AS buyer_nombre,
      (r.order_id IS NOT NULL)                           AS verified_purchase,
      o.created_at                                       AS order_date,
      r.created_at,
      r.updated_at,
      COALESCE(votes.helpful_count, 0)                   AS helpful_count,
      p.vendedor_id                                      AS seller_id,
      COALESCE(su.nombre, vp.nombre_comercio, 'Vendedor') AS seller_nombre,
      COALESCE(report_counts.total_reports, 0)           AS report_count,
      rr.id                                              AS response_id,
      rr.seller_id                                       AS response_seller_id,
      rr.respuesta,
      rr.created_at                                      AS response_created_at,
      rr.updated_at                                      AS response_updated_at,
      rs.id                                              AS signal_id,
      rs.risk_score,
      rs.trust_score,
      rs.quality_score,
      rs.signals                                         AS signal_payload,
      rs.created_at                                      AS signal_created_at,
      rs.updated_at                                      AS signal_updated_at,
      COUNT(*) OVER()::int                               AS total_count
    FROM reviews r
    JOIN productos p        ON p.id = r.producto_id
    LEFT JOIN users bu      ON bu.id = r.buyer_id
    LEFT JOIN users su      ON su.id = p.vendedor_id
    LEFT JOIN vendedor_perfil vp ON vp.user_id = p.vendedor_id
    LEFT JOIN orders o      ON o.id = r.order_id
    LEFT JOIN review_responses rr ON rr.review_id = r.id
    LEFT JOIN review_signals rs   ON rs.review_id = r.id
    LEFT JOIN (
      SELECT review_id, COUNT(*)::int AS total_reports
      FROM review_reports
      GROUP BY review_id
    ) report_counts ON report_counts.review_id = r.id
    LEFT JOIN (
      SELECT review_id, COUNT(*)::int AS helpful_count
      FROM review_votes
      GROUP BY review_id
    ) votes ON votes.review_id = r.id
    WHERE ${whereClauses}
    ORDER BY COALESCE(rs.risk_score, 0) DESC, COALESCE(report_counts.total_reports, 0) DESC, r.created_at DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements: {
        limit:  input.limit,
        offset: input.offset,
        ...(input.estado ? { estado: input.estado } : {}),
        ...(input.highRisk ? { highRiskThreshold: REVIEW_FLAG_RISK_THRESHOLD } : {}),
        ...(typeof input.minReports === "number" && input.minReports > 0 ? { minReports: input.minReports } : {}),
      },
      type: QueryTypes.SELECT,
    }
  );

  const total = Number(rows[0]?.total_count ?? 0);

  return {
    total,
    reviews: rows.map((row: any) => ({
      ...mapReviewRow(row),
      seller_id: Number(row.seller_id),
      seller_nombre: row.seller_nombre ?? "Vendedor",
      report_count: Number(row.report_count ?? 0),
    })),
  };
}

export async function getSellerReviewInsights(sellerId: number): Promise<SellerReviewInsights> {
  const [summary] = await sequelize.query<any>(
    `
    SELECT
      COUNT(r.id)::int                                                AS total_reviews,
      COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)                   AS rating_avg,
      COUNT(*) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days')::int AS recent_reviews_count,
      COUNT(*) FILTER (WHERE r.rating IN (1, 2))::int                 AS low_rating_count
    FROM reviews r
    JOIN productos p ON p.id = r.producto_id
    WHERE p.vendedor_id = :sellerId
      AND r.estado      = 'published'
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  );

  const distributionRows = await sequelize.query<{ rating: number; total: number }>(
    `
    SELECT r.rating, COUNT(*)::int AS total
    FROM reviews r
    JOIN productos p ON p.id = r.producto_id
    WHERE p.vendedor_id = :sellerId
      AND r.estado      = 'published'
    GROUP BY r.rating
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  );

  const topProducts = await sequelize.query<any>(
    `
    SELECT
      p.id::text                                    AS product_id,
      p.nombre                                      AS producto_nombre,
      COUNT(r.id)::int                              AS review_count,
      COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg
    FROM productos p
    LEFT JOIN reviews r
      ON r.producto_id = p.id
     AND r.estado      = 'published'
    WHERE p.vendedor_id = :sellerId
    GROUP BY p.id, p.nombre
    HAVING COUNT(r.id) > 0
    ORDER BY review_count DESC, rating_avg DESC, p.created_at DESC
    LIMIT 5
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  );

  const commentRows = await sequelize.query<{ comentario: string | null }>(
    `
    SELECT r.comentario
    FROM reviews r
    JOIN productos p ON p.id = r.producto_id
    WHERE p.vendedor_id = :sellerId
      AND r.estado      = 'published'
      AND r.comentario IS NOT NULL
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    }
  );

  const stopwords = new Set([
    "de", "la", "el", "y", "a", "en", "que", "muy", "con", "para", "una", "un",
    "del", "las", "los", "por", "me", "mi", "su", "es", "se", "lo", "al", "le",
  ]);
  const wordCounts = new Map<string, number>();

  for (const row of commentRows) {
    const tokens = String(row.comentario ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !stopwords.has(token));

    for (const token of tokens) {
      wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
    }
  }

  const frequent_terms = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));

  const rating_distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const row of distributionRows) {
    rating_distribution[String(row.rating)] = Number(row.total);
  }

  return {
    rating_avg: Number(summary?.rating_avg ?? 0),
    rating_distribution,
    total_reviews: Number(summary?.total_reviews ?? 0),
    recent_reviews_count: Number(summary?.recent_reviews_count ?? 0),
    low_rating_count: Number(summary?.low_rating_count ?? 0),
    top_products_by_reviews: topProducts.map((row: any) => ({
      product_id: row.product_id,
      producto_nombre: row.producto_nombre,
      review_count: Number(row.review_count),
      rating_avg: Number(row.rating_avg),
    })),
    frequent_terms,
  };
}

export async function hideReviewByAdmin(reviewId: string): Promise<RatingStats> {
  return updateReviewStatusByAdmin(reviewId, "hidden_by_admin");
}

export async function restoreReviewByAdmin(reviewId: string): Promise<RatingStats> {
  return updateReviewStatusByAdmin(reviewId, "published");
}

async function updateReviewStatusByAdmin(reviewId: string, estado: ReviewStatus): Promise<RatingStats> {
  const t = await sequelize.transaction();

  try {
    const [review] = await sequelize.query<{ producto_id: string }>(
      `
      SELECT producto_id::text AS producto_id
      FROM reviews
      WHERE id = :reviewId
      LIMIT 1
      `,
      {
        replacements: { reviewId },
        type:         QueryTypes.SELECT,
        transaction:  t,
      }
    );

    if (!review) {
      throw new Error("REVIEW_NOT_FOUND");
    }

    await sequelize.query(
      `
      UPDATE reviews
      SET estado     = :estado,
          updated_at = NOW()
      WHERE id = :reviewId
      `,
      {
        replacements: { reviewId, estado },
        transaction:  t,
      }
    );

    const stats = await recalculateProductRating(review.producto_id, t);
    await t.commit();
    return stats;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function getReviewById(reviewId: string, transaction?: Transaction): Promise<ReviewView | null> {
  const [row] = await sequelize.query<any>(
    `
    SELECT
      r.id,
      r.producto_id::text,
      p.nombre                                           AS producto_nombre,
      r.rating,
      r.comentario,
      r.estado,
      r.buyer_id,
      COALESCE(u.nombre, 'Comprador')                    AS buyer_nombre,
      (r.order_id IS NOT NULL)                           AS verified_purchase,
      o.created_at                                       AS order_date,
      r.created_at,
      r.updated_at,
      COALESCE(votes.helpful_count, 0)                   AS helpful_count,
      rr.id                                              AS response_id,
      rr.seller_id                                       AS response_seller_id,
      rr.respuesta,
      rr.created_at                                      AS response_created_at,
      rr.updated_at                                      AS response_updated_at,
      rs.id                                              AS signal_id,
      rs.risk_score,
      rs.trust_score,
      rs.quality_score,
      rs.signals                                         AS signal_payload,
      rs.created_at                                      AS signal_created_at,
      rs.updated_at                                      AS signal_updated_at
    FROM reviews r
    LEFT JOIN productos p ON p.id = r.producto_id
    LEFT JOIN users u     ON u.id = r.buyer_id
    LEFT JOIN orders o    ON o.id = r.order_id
    LEFT JOIN review_responses rr ON rr.review_id = r.id
    LEFT JOIN review_signals rs   ON rs.review_id = r.id
    LEFT JOIN (
      SELECT review_id, COUNT(*)::int AS helpful_count
      FROM review_votes
      GROUP BY review_id
    ) votes ON votes.review_id = r.id
    WHERE r.id = :reviewId
    LIMIT 1
    `,
    {
      replacements: { reviewId },
      type:         QueryTypes.SELECT,
      transaction,
    }
  );

  return row ? mapReviewRow(row) : null;
}
