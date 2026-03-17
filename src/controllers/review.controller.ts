// src/controllers/review.controller.ts

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import rateLimit from "express-rate-limit";

/* ============================================================
   🌟 GET SELLER RATING SUMMARY
   GET /api/reviews/seller/:sellerId/rating
============================================================ */
export const getSellerRating: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const [result] = await sequelize.query<{
      avg_rating: string | null;
      total: number;
    }>(
      `
      SELECT
        ROUND(AVG(rating)::numeric, 1)::text AS avg_rating,
        COUNT(*)::int                         AS total
      FROM reviews
      WHERE seller_id = :sellerId
      `,
      { replacements: { sellerId: Number(sellerId) }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      avg_rating: result?.avg_rating ? Number(result.avg_rating) : null,
      total: result?.total ?? 0,
    });
  } catch (err) {
    console.error("getSellerRating error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   📋 GET SELLER REVIEWS LIST
   GET /api/reviews/seller/:sellerId
============================================================ */
export const getSellerReviews: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const reviews = await sequelize.query<{
      id: number;
      rating: number;
      comment: string | null;
      buyer_name: string;
      product_id: string | null;
      product_nombre: string | null;
      created_at: string;
    }>(
      `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.buyer_name,
        r.product_id,
        p.nombre AS product_nombre,
        r.created_at
      FROM reviews r
      LEFT JOIN productos p ON p.id = r.product_id
      WHERE r.seller_id = :sellerId
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
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   ✍️ CREATE REVIEW
   POST /api/reviews/seller/:sellerId
   Body: { rating, comment?, buyer_name?, product_id? }
============================================================ */
export const createReview: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { rating, comment, buyer_name, product_id } = req.body;
    const buyer_id = (req as any).user?.id ?? null;

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ message: "rating debe ser entre 1 y 5" });
      return;
    }

    // Prevent duplicate review by same buyer for the same seller
    if (buyer_id) {
      const [existing] = await sequelize.query<{ id: number }>(
        `SELECT id FROM reviews WHERE seller_id = :sellerId AND buyer_id = :buyerId LIMIT 1`,
        {
          replacements: { sellerId: Number(sellerId), buyerId: buyer_id },
          type: QueryTypes.SELECT,
        }
      );
      if (existing) {
        res.status(409).json({ message: "Ya dejaste una reseña para este vendedor" });
        return;
      }
    }

    const [result] = await sequelize.query<{ id: number }>(
      `
      INSERT INTO reviews (seller_id, product_id, buyer_id, buyer_name, rating, comment)
      VALUES (:sellerId, :productId, :buyerId, :buyerName, :rating, :comment)
      RETURNING id
      `,
      {
        replacements: {
          sellerId:  Number(sellerId),
          productId: product_id || null,
          buyerId:   buyer_id,
          buyerName: buyer_name || "Comprador",
          rating:    Number(rating),
          comment:   comment || null,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({ success: true, id: result.id });
  } catch (err) {
    console.error("createReview error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   🚦 Rate limiter for public review submissions
============================================================ */
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Demasiados intentos. Intenta de nuevo en 1 hora.",
  standardHeaders: true,
  legacyHeaders: false,
});
