// src/controllers/order.controller.ts
//
// CRITICAL INVARIANTS:
//   - NEVER trust any price, total, or currency from the frontend.
//   - Backend computes all monetary values.
//   - Only verified webhooks may transition an order to "paid".

import { RequestHandler } from "express";
import {
  buildOrderDraft,
  createOrderFromCart,
  OrderValidationError,
  type CartItemInput,
} from "../services/order.service";
import { evaluateOrderRisk }          from "../services/paymentSecurity.service";
import { logAuditEventFromRequest }    from "../services/audit.service";
import { ORDER_LIMITS }               from "../config/paymentPolicies";
import Order          from "../models/Order.model";
import OrderItem      from "../models/OrderItem.model";
import PaymentAttempt from "../models/PaymentAttempt.model";

// ─────────────────────────────────────────────────────────────────────────────
// Status values visible to buyers
// ─────────────────────────────────────────────────────────────────────────────
const BUYER_VISIBLE_STATUSES = new Set([
  "pending_payment",
  "manual_review",
  "paid",
  "payment_failed",
  "cancelled",
  "completed",
]);

function normalizeReviewStatus(reviewStatus: Order["review_status"]): string {
  return reviewStatus ?? "not_required";
}

function serializeOrderSummary(order: Order) {
  return {
    id:              order.id,
    status:          order.status,
    review_status:   normalizeReviewStatus(order.review_status),
    currency:        order.currency,
    subtotal_amount: Number(order.subtotal_amount),
    fee_amount:      Number(order.fee_amount),
    total_amount:    Number(order.total_amount),
    created_at:      order.created_at,
  };
}

function serializeOrderItems(items: OrderItem[]) {
  return items.map((item) => ({
    id:                    item.id,
    product_id:            item.product_id,
    product_name_snapshot: item.product_name_snapshot,
    unit_price_snapshot:   Number(item.unit_price_snapshot),
    quantity:              item.quantity,
    line_total:            Number(item.line_total),
    created_at:            item.created_at,
  }));
}

/* ============================================================
   POST /api/orders
   Create a new order from a cart.

   Body:
   {
     items:     [{ product_id: string, quantity: number }],
     currency?: string
   }

   Response:
   {
     ok:    true,
     order: { id, status, currency, subtotal_amount, fee_amount, total_amount, review_status, created_at },
     code?:    "ORDER_MANUAL_REVIEW"   (only when manual review is required)
     message?: string
   }
============================================================ */
export const createOrder: RequestHandler = async (req, res) => {
  try {
    const userId = req.user!.id;
    const ip     = req.ip ?? req.socket?.remoteAddress ?? "unknown";

    const items: CartItemInput[] = req.body?.items;
    const currency: string = typeof req.body?.currency === "string"
      ? req.body.currency.toUpperCase()
      : ORDER_LIMITS.DEFAULT_CURRENCY;

    // ── Basic input validation ────────────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ ok: false, message: "Se requiere al menos un producto en el carrito" });
      return;
    }

    for (const item of items) {
      if (typeof item.product_id !== "string" || !item.product_id.trim()) {
        res.status(400).json({ ok: false, message: "product_id inválido en uno de los ítems" });
        return;
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        res.status(400).json({ ok: false, message: `Cantidad inválida para producto ${item.product_id}` });
        return;
      }
    }

    // ── Build draft to get server-authoritative amounts for risk evaluation ─
    const draft = await buildOrderDraft(items, currency);

    const riskResult = await evaluateOrderRisk({
      userId,
      ip,
      totalAmount: draft.total_amount,
    });

    if (riskResult.decision === "deny") {
      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.denied",
        status:        "blocked",
        severity:      "high",
        metadata:      { reason: riskResult.reason, riskLevel: riskResult.riskLevel },
      });
      res.status(403).json({
        ok:      false,
        message: "Pedido rechazado por política de seguridad",
        code:    "ORDER_DENIED",
      });
      return;
    }

    const orderStatus = riskResult.decision === "manual_review"
      ? "manual_review"
      : "pending_payment";

    const order = await createOrderFromCart(
      userId,
      items,
      currency,
      riskResult.riskLevel,
      orderStatus,
    );

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    req.user!.role,
      action:        "order.created",
      entity_type:   "order",
      entity_id:     String(order.id),
      status:        "success",
      severity:      "low",
      metadata:      {
        total_amount: Number(order.total_amount),
        currency:     order.currency,
        riskLevel:    riskResult.riskLevel,
        orderStatus,
      },
    });

    if (riskResult.decision === "manual_review") {
      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.manual_review_required",
        entity_type:   "order",
        entity_id:     String(order.id),
        status:        "success",
        severity:      "medium",
        metadata:      {
          reason:      riskResult.reason,
          riskLevel:   riskResult.riskLevel,
          totalAmount: Number(order.total_amount),
        },
      });

      res.status(202).json({
        ok:      true,
        code:    "ORDER_MANUAL_REVIEW",
        message: "Tu pedido está en revisión. El equipo lo revisará a la brevedad.",
        order: serializeOrderSummary(order),
      });
      return;
    }

    res.status(201).json({
      ok:    true,
      order: serializeOrderSummary(order),
    });
  } catch (err) {
    if (err instanceof OrderValidationError) {
      res.status(400).json({ ok: false, message: err.message, code: err.code });
      return;
    }
    console.error("createOrder error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/orders/my
   Paginated list of the authenticated buyer's own orders.

   Query: ?limit=20&offset=0&status=pending_payment
============================================================ */
export const getMyOrders: RequestHandler = async (req, res) => {
  try {
    const userId = req.user!.id;

    const limitParam  = typeof req.query.limit  === "string" ? req.query.limit  : "20";
    const offsetParam = typeof req.query.offset === "string" ? req.query.offset : "0";
    const limit  = Math.min(Math.max(Number(limitParam)  || 20, 1), 100);
    const offset = Math.max(Number(offsetParam) || 0, 0);

    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Record<string, unknown> = { buyer_id: userId };

    if (statusFilter) {
      if (!BUYER_VISIBLE_STATUSES.has(statusFilter)) {
        res.status(400).json({ ok: false, message: "Valor de status inválido" });
        return;
      }
      where.status = statusFilter;
    }

    const { rows, count } = await Order.findAndCountAll({
      where,
      order:      [["created_at", "DESC"]],
      limit,
      offset,
      attributes: [
        "id", "status", "review_status", "currency",
        "subtotal_amount", "fee_amount", "total_amount", "created_at",
      ],
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    req.user!.role,
      action:        "order.fetch.self",
      status:        "success",
      severity:      "low",
      metadata:      { fetched: rows.length, total: count },
    });

    res.json({
      ok:     true,
      total:  count,
      limit,
      offset,
      orders: rows.map(o => ({
        id:              o.id,
        status:          o.status,
        review_status:   normalizeReviewStatus(o.review_status),
        currency:        o.currency,
        subtotal_amount: Number(o.subtotal_amount),
        fee_amount:      Number(o.fee_amount),
        total_amount:    Number(o.total_amount),
        created_at:      o.created_at,
      })),
    });
  } catch (err) {
    console.error("getMyOrders error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   GET /api/orders/:id
   Get a single order with items and latest payment attempt info.

   Access:
   - buyer: only own orders
   - seller: only orders on their products
   - admin: all
============================================================ */
export const getOrder: RequestHandler = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      res.status(400).json({ ok: false, message: "orderId inválido" });
      return;
    }

    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: "items" }],
    });

    if (!order) {
      res.status(404).json({ ok: false, message: "Pedido no encontrado" });
      return;
    }

    const userId   = req.user!.id;
    const userRole = req.user!.role;

    if (userRole === "buyer" && order.buyer_id !== userId) {
      res.status(403).json({ ok: false, message: "Acceso denegado" });
      return;
    }

    if (userRole === "seller" && order.seller_id !== userId) {
      res.status(403).json({ ok: false, message: "Acceso denegado" });
      return;
    }

    // Latest payment attempt — used by frontend for payment state polling
    const latestAttempt = await PaymentAttempt.findOne({
      where:      { order_id: orderId },
      order:      [["created_at", "DESC"]],
      attributes: ["id", "status", "provider", "provider_intent_id", "failure_reason", "created_at"],
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    userRole,
      action:        "order.fetch.self",
      entity_type:   "order",
      entity_id:     String(orderId),
      status:        "success",
      severity:      "low",
    });

    res.json({
      ok:    true,
      order: {
        ...serializeOrderSummary(order),
        items: serializeOrderItems(
          ((order as Order & { items?: OrderItem[] }).items ?? []),
        ),
      },
      payment: latestAttempt ? {
        latest_attempt_status:     latestAttempt.status,
        latest_provider:           latestAttempt.provider,
        latest_provider_intent_id: latestAttempt.provider_intent_id,
      } : null,
    });
  } catch (err) {
    console.error("getOrder error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};
