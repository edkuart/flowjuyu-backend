// src/controllers/review.controller.ts
//
// Real reviews table schema (confirmed from live DB):
//   id          UUID  PK
//   producto_id UUID  NOT NULL  → referencias productos.id
//   buyer_id    INT   NOT NULL
//   rating      INT   NOT NULL  (1–5)
//   comentario  TEXT
//   created_at  TIMESTAMP
//
// There is NO seller_id column. Reviews are linked to sellers
// through the chain: reviews.producto_id → productos.id → productos.vendedor_id

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import rateLimit from "express-rate-limit";
import { createNotification } from "../utils/notifications";
import { logAuditEventFromRequest } from "../services/audit.service";
import { checkReviewAbuse } from "../services/abuseDetection.service";
import { REVIEW_RULES } from "../config/securityRules";

/* ============================================================
   🌟 GET SELLER RATING SUMMARY
   GET /api/reviews/seller/:sellerId/rating
============================================================ */
export const getSellerRating: RequestHandler = async (req, res) => {
  const { sellerId } = req.params;
  const safeEmpty = { success: true, data: { rating: 0, total_reviews: 0 } };

  try {
    const id = Number(sellerId);
    if (!Number.isFinite(id) || id <= 0) {
      res.json(safeEmpty);
      return;
    }

    const [result] = await sequelize.query<{
      rating: string;
      total_reviews: string;
    }>(
      `
      SELECT
        COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS rating,
        COUNT(r.id)                                    AS total_reviews
      FROM reviews r
      JOIN productos p ON p.id = r.producto_id
      WHERE p.vendedor_id = :sellerId
      `,
      { replacements: { sellerId: id }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        rating:        Number(result?.rating        ?? 0),
        total_reviews: Number(result?.total_reviews ?? 0),
      },
    });
  } catch (err) {
    console.error("SELLER RATING ERROR:", (err as any)?.message);
    console.error("PG ERROR:", (err as any)?.parent?.message);
    res.json(safeEmpty);
  }
};

/* ============================================================
   📋 GET SELLER REVIEWS LIST
   GET /api/reviews/seller/:sellerId
============================================================ */
export const getSellerReviews: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0,  0);

    const reviews = await sequelize.query<{
      id: string;
      rating: number;
      comment: string | null;
      buyer_name: string;
      product_id: string;
      product_nombre: string | null;
      created_at: string;
    }>(
      `
      SELECT
        r.id,
        r.rating,
        r.comentario             AS comment,
        'Comprador'              AS buyer_name,
        r.producto_id::text      AS product_id,
        p.nombre                 AS product_nombre,
        r.created_at
      FROM reviews r
      JOIN productos p ON p.id = r.producto_id
      WHERE p.vendedor_id = :sellerId
      ORDER BY r.created_at DESC
      LIMIT :limit OFFSET :offset
      `,
      {
        replacements: { sellerId: Number(sellerId), limit, offset },
        type: QueryTypes.SELECT,
      }
    );

    res.json({ success: true, data: reviews });
  } catch (err) {
    console.error("getSellerReviews error:", err);
    res.json({ success: true, data: [] });
  }
};

/* ============================================================
   ✍️ CREATE REVIEW
   POST /api/reviews/seller/:sellerId
   Requires: authenticated buyer (requireRole("buyer") in route)
   Body: { rating, comment?, product_id? }
   Notes:
   - product_id (UUID) must belong to the seller.
   - If omitted, the first active product of the seller is used.
   - buyer_id is always taken from req.user — never trusted from body.
============================================================ */
export const createReview: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { rating, comment, product_id } = req.body;

    // Validate sellerId before any DB query — Number("abc") is NaN which
    // causes a PostgreSQL type error and a misleading 500 response.
    const sellerIdNum = Number(sellerId);
    if (!Number.isFinite(sellerIdNum) || sellerIdNum <= 0) {
      res.status(400).json({ message: "sellerId inválido" });
      return;
    }

    // req.user is guaranteed to exist — requireRole("buyer") enforces this.
    const buyer_id = req.user!.id;
    const abuseCheck = await checkReviewAbuse({
      userId: buyer_id,
      ip:     req.ip ?? req.socket?.remoteAddress ?? "unknown",
    });

    if (abuseCheck.blocked) {
      void logAuditEventFromRequest(req, {
        actor_user_id: buyer_id,
        actor_role:    "buyer",
        action:        "review.create.blocked",
        entity_type:   "seller",
        entity_id:     String(sellerIdNum),
        status:        "blocked",
        severity:      "high",
        metadata: {
          reason:        abuseCheck.reason,
          threshold:     REVIEW_RULES.maxAttempts,
          windowMinutes: REVIEW_RULES.windowMinutes,
          retryAfter:    abuseCheck.retryAfter,
        },
      });
      res.setHeader("Retry-After", String(abuseCheck.retryAfter ?? REVIEW_RULES.blockDurationMinutes * 60));
      res.status(429).json({
        ok:      false,
        code:    "ABUSE_PROTECTION_TRIGGERED",
        message: "Too many attempts. Please try again later.",
      });
      return;
    }

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ message: "rating debe ser entre 1 y 5" });
      return;
    }

    // Resolve producto_id: use provided or fall back to first seller product.
    // When product_id is provided by the client, validate it belongs to :sellerId
    // to prevent a buyer from posting reviews to a seller via a foreign product.
    let producto_id: string | null = null;

    if (product_id) {
      const [owned] = await sequelize.query<{ id: string }>(
        `SELECT id FROM productos
         WHERE id = :productId
           AND vendedor_id = :sellerId
           AND activo = true
         LIMIT 1`,
        {
          replacements: {
            productId: product_id,
            sellerId:  sellerIdNum,
          },
          type: QueryTypes.SELECT,
        }
      );

      if (!owned) {
        void logAuditEventFromRequest(req, {
          actor_user_id: buyer_id,
          actor_role:    "buyer",
          action:        "review.create.mismatch_blocked",
          entity_type:   "seller",
          entity_id:     String(sellerIdNum),
          status:        "blocked",
          severity:      "medium",
          metadata:      { product_id, seller_id: sellerIdNum },
        });
        res.status(400).json({ message: "Producto no válido para este vendedor" });
        return;
      }

      producto_id = owned.id;
    } else {
      const [firstProduct] = await sequelize.query<{ id: string }>(
        `SELECT id FROM productos WHERE vendedor_id = :sellerId AND activo = true LIMIT 1`,
        {
          replacements: { sellerId: sellerIdNum },
          type: QueryTypes.SELECT,
        }
      );
      producto_id = firstProduct?.id ?? null;
    }

    if (!producto_id) {
      res.status(400).json({ message: "Este vendedor no tiene productos activos para reseñar" });
      return;
    }

    // Prevent duplicate review by same buyer for the same product
    const [existing] = await sequelize.query<{ id: string }>(
      `SELECT id FROM reviews WHERE producto_id = :productoId AND buyer_id = :buyerId LIMIT 1`,
      {
        replacements: { productoId: producto_id, buyerId: buyer_id },
        type: QueryTypes.SELECT,
      }
    );
    if (existing) {
      void logAuditEventFromRequest(req, {
        actor_user_id: buyer_id,
        actor_role:    "buyer",
        action:        "review.create.duplicate_blocked",
        entity_type:   "product",
        entity_id:     producto_id,
        status:        "blocked",
        severity:      "low",
        metadata:      { seller_id: sellerIdNum, product_id: producto_id },
      });
      res.status(409).json({ message: "Ya dejaste una reseña para este producto" });
      return;
    }

    const [result] = await sequelize.query<{ id: string }>(
      `
      INSERT INTO reviews (producto_id, buyer_id, rating, comentario)
      VALUES (:productoId, :buyerId, :rating, :comentario)
      RETURNING id
      `,
      {
        replacements: {
          productoId:  producto_id,
          buyerId:     buyer_id,
          rating:      Number(rating),
          comentario:  comment || null,
        },
        type: QueryTypes.SELECT,
      }
    );

    createNotification(
      buyer_id,
      "review",
      "Dejaste una reseña",
      "Tu opinión ayuda a otros compradores.",
      `/product/${producto_id}`
    ).catch(() => {/* non-critical */});

    void logAuditEventFromRequest(req, {
      actor_user_id: buyer_id,
      actor_role:    "buyer",
      action:        "review.create.success",
      entity_type:   "product",
      entity_id:     producto_id,
      target_user_id: sellerIdNum,
      status:        "success",
      severity:      "low",
      metadata:      { review_id: result.id, rating: Number(rating), seller_id: sellerIdNum },
    });

    res.status(201).json({ success: true, id: result.id });
  } catch (err) {
    console.error("createReview error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   🚦 Rate limiter for review submissions
============================================================ */
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Demasiados intentos. Intenta de nuevo en 1 hora.",
  standardHeaders: true,
  legacyHeaders: false,
});
