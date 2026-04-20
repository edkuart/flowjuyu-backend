// src/controllers/review.controller.ts

import { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import { emitAppEvent } from "../lib/appEvents";
import { logAuditEventFromRequest } from "../services/audit.service";
import { checkReviewAbuse } from "../services/abuseDetection.service";
import { REVIEW_RULES } from "../config/securityRules";
import { evaluateReviewDefense } from "../services/activeDefense.service";
import {
  addHelpfulVote,
  createReviewFromPurchase,
  getSellerReviewInsights,
  getReviewResponse,
  getSellerRatingSummary,
  listSellerReviews,
  removeHelpfulVote,
  reportReview,
  restoreReviewByAdmin,
  softDeleteReview,
  upsertSellerResponse,
  updateReview,
  validateReviewEligibility,
  hideReviewByAdmin,
  listAdminReviews,
} from "../services/review.service";

function isPgUniqueViolation(error: any): boolean {
  return error?.parent?.code === "23505";
}

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

export const getSellerRating: RequestHandler = async (req, res) => {
  const { sellerId } = req.params;
  const safeEmpty = { success: true, data: { rating: 0, total_reviews: 0 } };

  try {
    const id = Number(sellerId);
    if (!Number.isFinite(id) || id <= 0) {
      res.json(safeEmpty);
      return;
    }

    res.json({ success: true, data: await getSellerRatingSummary(id) });
  } catch (err) {
    console.error("SELLER RATING ERROR:", (err as any)?.message);
    res.json(safeEmpty);
  }
};

export const getSellerReviews: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);
    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    if (!Number.isFinite(sellerId) || sellerId <= 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const reviews = await listSellerReviews(sellerId, limit, offset);
    res.json({ success: true, data: reviews });
  } catch (err) {
    console.error("getSellerReviews error:", err);
    res.json({ success: true, data: [] });
  }
};

export const getProductReviewEligibility: RequestHandler = async (req, res) => {
  try {
    const buyer_id = req.user?.id;
    const productId = getRouteParam(req.params.id);

    if (!buyer_id) {
      res.status(401).json({ eligible: false, reason: "not_authenticated" });
      return;
    }

    const result = await validateReviewEligibility(Number(buyer_id), productId);

    res.json({
      eligible: result.eligible,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (err) {
    console.error("getProductReviewEligibility error:", err);
    res.json({ eligible: false, reason: "error" });
  }
};

export const createReview: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { rating, comment, product_id } = req.body;

    const sellerIdNum = Number(sellerId);
    if (!Number.isFinite(sellerIdNum) || sellerIdNum <= 0) {
      res.status(400).json({ message: "sellerId inválido" });
      return;
    }

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

    const defense = await evaluateReviewDefense({
      userId: buyer_id,
      ip:     req.ip ?? req.socket?.remoteAddress ?? "unknown",
    });

    if (defense.decision === "cooldown" || defense.decision === "deny") {
      void logAuditEventFromRequest(req, {
        actor_user_id: buyer_id,
        actor_role:    "buyer",
        action:        "defense.review.block_applied",
        entity_type:   "seller",
        entity_id:     String(sellerIdNum),
        status:        "blocked",
        severity:      defense.decision === "deny" ? "critical" : "high",
        metadata: {
          reason:             defense.reason,
          retryAfter:         defense.retryAfter,
          restrictionCreated: defense.restrictionCreated ?? false,
        },
      });
      if (defense.retryAfter) {
        res.setHeader("Retry-After", String(defense.retryAfter));
      }
      res.status(429).json({
        ok:      false,
        code:    "ACTIVE_DEFENSE_TRIGGERED",
        message: "Action temporarily restricted. Please try again later.",
      });
      return;
    }

    const ratingNumber = Number(rating);
    if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
      res.status(400).json({ message: "rating debe ser entre 1 y 5" });
      return;
    }

    let producto_id: string | null = null;

    if (product_id) {
      const [owned] = await sequelize.query<{ id: string }>(
        `
        SELECT id FROM productos
        WHERE id = :productId
          AND vendedor_id = :sellerId
          AND activo = true
        LIMIT 1
        `,
        {
          replacements: { productId: product_id, sellerId: sellerIdNum },
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

    try {
      const created = await createReviewFromPurchase({
        buyerId:   buyer_id,
        productId: producto_id,
        rating:    ratingNumber,
        comentario: comment ?? null,
      });

      emitAppEvent("review.created", {
        buyerId:   buyer_id,
        sellerId:  sellerIdNum,
        productId: producto_id,
        rating:    ratingNumber,
      });

      void logAuditEventFromRequest(req, {
        actor_user_id:  buyer_id,
        actor_role:     "buyer",
        action:         "review.create.success",
        entity_type:    "product",
        entity_id:      producto_id,
        target_user_id: sellerIdNum,
        status:         "success",
        severity:       "low",
        metadata: {
          review_id:     created.review_id,
          rating:        ratingNumber,
          seller_id:     sellerIdNum,
          order_item_id: created.order_item_id,
        },
      });

      res.status(201).json({ success: true, id: created.review_id });
    } catch (error: any) {
      if (error?.message === "ALREADY_REVIEWED") {
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

      if (error?.message === "PURCHASE_REQUIRED") {
        void logAuditEventFromRequest(req, {
          actor_user_id: buyer_id,
          actor_role:    "buyer",
          action:        "review.create.no_purchase_blocked",
          entity_type:   "product",
          entity_id:     producto_id,
          status:        "blocked",
          severity:      "low",
          metadata:      { seller_id: sellerIdNum, product_id: producto_id },
        });
        res.status(403).json({
          message: "Solo puedes reseñar productos que hayas comprado y recibido",
          code:    "PURCHASE_REQUIRED",
        });
        return;
      }

      if (error?.message === "PRODUCT_NOT_REVIEWABLE") {
        res.status(404).json({ message: "Producto no disponible para reseñas" });
        return;
      }

      throw error;
    }
  } catch (err) {
    console.error("createReview error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

export const putReview: RequestHandler = async (req, res) => {
  try {
    const buyerId = Number(req.user?.id);
    const rating = Number(req.body.rating);

    if (!buyerId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ message: "rating debe ser entre 1 y 5" });
      return;
    }

    const result = await updateReview({
      reviewId:   getRouteParam(req.params.id),
      buyerId,
      rating,
      comentario: req.body.comment ?? req.body.comentario ?? null,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: buyerId,
      actor_role:    "buyer",
      action:        "review.edit.success",
      entity_type:   "review",
      entity_id:     getRouteParam(req.params.id),
      status:        "success",
      severity:      "low",
      metadata:      { rating, product_id: result.review.producto_id },
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    if (error?.message === "REVIEW_NOT_OWNER") {
      res.status(403).json({ message: "No puedes editar esta reseña" });
      return;
    }
    if (error?.message === "REVIEW_NOT_EDITABLE" || error?.message === "REVIEW_EDIT_WINDOW_EXPIRED") {
      res.status(409).json({
        message: "La reseña ya no se puede editar",
        code:    "REVIEW_EDIT_WINDOW_EXPIRED",
      });
      return;
    }
    console.error("putReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const deleteReview: RequestHandler = async (req, res) => {
  try {
    const buyerId = Number(req.user?.id);
    if (!buyerId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const reviewId = getRouteParam(req.params.id);
    const stats = await softDeleteReview(reviewId, buyerId);

    void logAuditEventFromRequest(req, {
      actor_user_id: buyerId,
      actor_role:    "buyer",
      action:        "review.delete.success",
      entity_type:   "review",
      entity_id:     reviewId,
      status:        "success",
      severity:      "low",
    });

    res.json({ success: true, ...stats });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    if (error?.message === "REVIEW_NOT_OWNER") {
      res.status(403).json({ message: "No puedes eliminar esta reseña" });
      return;
    }
    if (error?.message === "REVIEW_ALREADY_DELETED") {
      res.status(409).json({ message: "La reseña ya fue eliminada" });
      return;
    }
    console.error("deleteReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const respondToReview: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.user?.id);
    if (!sellerId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const response = await upsertSellerResponse({
      reviewId:  getRouteParam(req.params.id),
      sellerId,
      respuesta: req.body.respuesta ?? req.body.response ?? "",
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: sellerId,
      actor_role:    "seller",
      action:        "review.response.upsert.success",
      entity_type:   "review",
      entity_id:     getRouteParam(req.params.id),
      status:        "success",
      severity:      "low",
    });

    res.status(201).json({ success: true, data: response });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    if (error?.message === "SELLER_NOT_OWNER") {
      res.status(403).json({ message: "No puedes responder esta reseña" });
      return;
    }
    if (error?.message === "RESPONSE_REQUIRED") {
      res.status(400).json({ message: "La respuesta es obligatoria" });
      return;
    }
    console.error("respondToReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getReviewResponseById: RequestHandler = async (req, res) => {
  try {
    const response = await getReviewResponse(getRouteParam(req.params.id));
    res.json({ success: true, data: response });
  } catch (error) {
    console.error("getReviewResponseById error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const reportReviewHandler: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = req.user?.role;

    if (!userId || !role) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    await reportReview({
      reviewId: getRouteParam(req.params.id),
      userId,
      motivo:   req.body.motivo ?? req.body.reason ?? "",
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    role,
      action:        "review.report.success",
      entity_type:   "review",
      entity_id:     getRouteParam(req.params.id),
      status:        "success",
      severity:      "medium",
      metadata:      { motivo: req.body.motivo ?? req.body.reason ?? null },
    });

    res.status(201).json({ success: true });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    if (error?.message === "REPORT_NOT_ALLOWED") {
      res.status(403).json({ message: "No puedes reportar esta reseña" });
      return;
    }
    if (error?.message === "REPORT_REASON_REQUIRED") {
      res.status(400).json({ message: "El motivo es obligatorio" });
      return;
    }
    if (error?.message === "REVIEW_ALREADY_REPORTED" || isPgUniqueViolation(error)) {
      res.status(409).json({ message: "Ya reportaste esta reseña" });
      return;
    }
    console.error("reportReviewHandler error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getAdminReviews: RequestHandler = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
    const highRisk = String(req.query.high_risk ?? "").toLowerCase() === "true";
    const minReports = Number(req.query.min_reports);

    const data = await listAdminReviews({
      limit,
      offset,
      ...(estado ? { estado: estado as any } : {}),
      ...(highRisk ? { highRisk: true } : {}),
      ...(Number.isFinite(minReports) && minReports > 0 ? { minReports } : {}),
    });

    res.json({ success: true, ...data });
  } catch (error) {
    console.error("getAdminReviews error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const hideAdminReview: RequestHandler = async (req, res) => {
  try {
    const reviewId = getRouteParam(req.params.id);
    const stats = await hideReviewByAdmin(reviewId);

    void logAuditEventFromRequest(req, {
      actor_user_id: Number(req.user?.id),
      actor_role:    "admin",
      action:        "admin.review.hide.success",
      entity_type:   "review",
      entity_id:     reviewId,
      status:        "success",
      severity:      "medium",
    });

    res.json({ success: true, ...stats });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    console.error("hideAdminReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const restoreAdminReview: RequestHandler = async (req, res) => {
  try {
    const reviewId = getRouteParam(req.params.id);
    const stats = await restoreReviewByAdmin(reviewId);

    void logAuditEventFromRequest(req, {
      actor_user_id: Number(req.user?.id),
      actor_role:    "admin",
      action:        "admin.review.restore.success",
      entity_type:   "review",
      entity_id:     reviewId,
      status:        "success",
      severity:      "medium",
    });

    res.json({ success: true, ...stats });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    console.error("restoreAdminReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const voteReviewHandler: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const data = await addHelpfulVote({
      reviewId: getRouteParam(req.params.id),
      userId,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    req.user?.role ?? "buyer",
      action:        "review.vote.success",
      entity_type:   "review",
      entity_id:     getRouteParam(req.params.id),
      status:        "success",
      severity:      "low",
    });

    res.status(201).json({ success: true, ...data });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    if (error?.message === "REVIEW_NOT_VOTABLE") {
      res.status(409).json({ message: "La reseña no puede recibir votos" });
      return;
    }
    if (error?.message === "REVIEW_SELF_VOTE_NOT_ALLOWED") {
      res.status(403).json({ message: "No puedes votar tu propia reseña" });
      return;
    }
    if (error?.message === "REVIEW_ALREADY_VOTED") {
      res.status(409).json({ message: "Ya votaste esta reseña" });
      return;
    }
    console.error("voteReviewHandler error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const unvoteReviewHandler: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const data = await removeHelpfulVote({
      reviewId: getRouteParam(req.params.id),
      userId,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    req.user?.role ?? "buyer",
      action:        "review.vote.remove.success",
      entity_type:   "review",
      entity_id:     getRouteParam(req.params.id),
      status:        "success",
      severity:      "low",
    });

    res.json({ success: true, ...data });
  } catch (error: any) {
    if (error?.message === "REVIEW_NOT_FOUND") {
      res.status(404).json({ message: "Reseña no encontrada" });
      return;
    }
    if (error?.message === "REVIEW_VOTE_NOT_FOUND") {
      res.status(404).json({ message: "No habías votado esta reseña" });
      return;
    }
    console.error("unvoteReviewHandler error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getSellerReviewInsightsHandler: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.user?.id);
    if (!sellerId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const data = await getSellerReviewInsights(sellerId);
    res.json({ success: true, ...data });
  } catch (error) {
    console.error("getSellerReviewInsightsHandler error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos. Intenta de nuevo en 1 hora.",
  standardHeaders: true,
  legacyHeaders: false,
});

export const reviewVoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Demasiados votos. Intenta de nuevo en 1 hora.",
  standardHeaders: true,
  legacyHeaders: false,
});
