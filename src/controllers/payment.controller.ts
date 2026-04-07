// src/controllers/payment.controller.ts
//
// CRITICAL INVARIANTS:
//   - amount_expected is ALWAYS taken from the Order DB record, never from the request.
//   - Order status transitions to "paid" ONLY from a verified webhook, never here.
//   - idempotency_key uniqueness is enforced at DB level.
//   - Do NOT call provider APIs or return real clientSecret here (stubbed).

import { RequestHandler } from "express";
import { Op, UniqueConstraintError } from "sequelize";
import PaymentAttempt     from "../models/PaymentAttempt.model";
import Order              from "../models/Order.model";
import { evaluatePaymentAttempt }   from "../services/paymentSecurity.service";
import { processWebhookEvent }      from "../services/paymentWebhook.service";
import { logAuditEventFromRequest } from "../services/audit.service";

// ─────────────────────────────────────────────────────────────────────────────
// Supported providers allowlist
// ─────────────────────────────────────────────────────────────────────────────
const SUPPORTED_PROVIDERS = new Set(["stripe", "paypal", "mercadopago", "payu"]);

// Statuses that represent an active (non-terminal) payment attempt
const ACTIVE_ATTEMPT_STATUSES: PaymentAttempt["status"][] = ["created", "pending", "manual_review"];

// Order statuses that allow initiating a payment attempt
const PAYABLE_ORDER_STATUSES = new Set(["pending_payment", "payment_failed"]);

function normalizeReviewStatus(reviewStatus: Order["review_status"]): string {
  return reviewStatus ?? "not_required";
}

function buildProviderIntentId(provider: string, attemptId: number): string {
  return `stub_${provider}_attempt_${attemptId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCheckoutPayload
//
// Returns the provider-ready checkout object. Real provider API calls
// (Stripe PaymentIntent creation, etc.) would happen here. For now this
// is a stub-safe structure — the frontend must not interpret null clientSecret
// as a confirmed payment.
// ─────────────────────────────────────────────────────────────────────────────
function buildCheckoutPayload(attempt: PaymentAttempt): {
  clientSecret:      string | null;
  providerIntentId:  string | null;
  nextAction:        string;
} {
  // TODO: wire up actual provider SDK calls here per provider.
  // Stripe: create PaymentIntent → return client_secret
  // MercadoPago: create preference → return init_point URL
  // Until integrated, return null so the frontend knows it's a stub.
  return {
    clientSecret:     null,
    providerIntentId: attempt.provider_intent_id ?? null,
    nextAction:       "confirm_payment",
  };
}

/* ============================================================
   POST /api/payments/attempts
   Create (or reuse) a payment attempt for an existing order.

   Body:
   {
     order_id:         number,
     provider:         string,
     idempotency_key:  string    (client-generated UUID; must be unique per attempt)
   }

   Response for allow:
   {
     ok:             true,
     paymentAttempt: { id, status, provider, amount_expected, currency, created_at },
     checkout:       { clientSecret, providerIntentId, nextAction }
   }

   Response codes:
     PAYMENT_ALREADY_CONFIRMED  — order is already paid
     PAYMENT_MANUAL_REVIEW      — order or attempt requires manual review
     PAYMENT_NOT_PAYABLE        — order is in a state that doesn't allow payment
     PAYMENT_DENIED             — risk policy blocked the attempt
     PAYMENT_REUSED             — an active attempt was reused (no new attempt created)
============================================================ */
export const createPaymentAttempt: RequestHandler = async (req, res) => {
  try {
    const userId = req.user!.id;
    const ip     = req.ip ?? req.socket?.remoteAddress ?? "unknown";

    const orderId        = Number(req.body?.order_id);
    const provider       = typeof req.body?.provider === "string"
      ? req.body.provider.trim().toLowerCase()
      : "";
    const idempotencyKey = typeof req.body?.idempotency_key === "string"
      ? req.body.idempotency_key.trim()
      : "";

    // ── Input validation ──────────────────────────────────────────────────
    if (!Number.isFinite(orderId) || orderId <= 0) {
      res.status(400).json({ ok: false, message: "order_id inválido" });
      return;
    }

    if (!provider || !SUPPORTED_PROVIDERS.has(provider)) {
      res.status(400).json({
        ok:      false,
        message: `Proveedor de pago no soportado. Proveedores válidos: ${[...SUPPORTED_PROVIDERS].join(", ")}`,
      });
      return;
    }

    if (!idempotencyKey || idempotencyKey.length > 255) {
      res.status(400).json({ ok: false, message: "idempotency_key requerido (máx 255 caracteres)" });
      return;
    }

    // ── Load order — all monetary values come from DB, never from request ─
    const order = await Order.findByPk(orderId);

    if (!order) {
      res.status(404).json({ ok: false, message: "Pedido no encontrado" });
      return;
    }

    // Only the order's buyer can initiate payment
    if (order.buyer_id !== userId) {
      res.status(403).json({ ok: false, message: "Acceso denegado" });
      return;
    }

    // ── Guard: already paid ───────────────────────────────────────────────
    if (order.status === "paid" || order.status === "completed") {
      res.status(409).json({
        ok:      false,
        code:    "PAYMENT_ALREADY_CONFIRMED",
        message: "Este pedido ya ha sido pagado",
      });
      return;
    }

    const idempotentAttempt = await PaymentAttempt.findOne({
      where: { idempotency_key: idempotencyKey },
    });

    if (idempotentAttempt) {
      if (idempotentAttempt.order_id !== orderId) {
        res.status(409).json({
          ok:      false,
          code:    "PAYMENT_NOT_PAYABLE",
          message: "El idempotency_key ya fue usado para otro pedido",
        });
        return;
      }

      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.reused",
        entity_type:   "payment_attempt",
        entity_id:     String(idempotentAttempt.id),
        status:        "success",
        severity:      "low",
        metadata:      { orderId, provider: idempotentAttempt.provider, idempotent: true },
      });

      res.status(200).json({
        ok:   true,
        code: "PAYMENT_REUSED",
        paymentAttempt: {
          id:              idempotentAttempt.id,
          status:          idempotentAttempt.status,
          provider:        idempotentAttempt.provider,
          amount_expected: Number(idempotentAttempt.amount_expected),
          currency:        idempotentAttempt.currency,
        },
        checkout: buildCheckoutPayload(idempotentAttempt),
      });
      return;
    }

    // ── Guard: order in manual review (not yet approved) ─────────────────
    if (
      order.status === "manual_review" ||
      order.review_status === "pending" ||
      order.review_status === "rejected"
    ) {
      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.manual_review_required",
        entity_type:   "order",
        entity_id:     String(orderId),
        status:        "blocked",
        severity:      "medium",
        metadata:      { reason: "order_in_manual_review", provider },
      });
      res.status(202).json({
        ok:      true,
        code:    "PAYMENT_MANUAL_REVIEW",
        message: "Tu pedido está en revisión. El pago se habilitará una vez que sea aprobado.",
        order: {
          id:            order.id,
          status:        order.status,
          review_status: normalizeReviewStatus(order.review_status),
        },
      });
      return;
    }

    // ── Guard: non-payable states ─────────────────────────────────────────
    if (!PAYABLE_ORDER_STATUSES.has(order.status)) {
      res.status(409).json({
        ok:      false,
        code:    "PAYMENT_NOT_PAYABLE",
        message: `El pedido no está disponible para pago (estado: ${order.status})`,
      });
      return;
    }

    // ── Reuse active attempt for this order (any provider) ───────────────
    // Prevents conflicting concurrent attempts. If the buyer explicitly wants
    // a different provider they must cancel the existing attempt first (future).
    const existingAttempt = await PaymentAttempt.findOne({
      where: {
        order_id: orderId,
        status:   { [Op.in]: ACTIVE_ATTEMPT_STATUSES },
      },
      order: [["created_at", "DESC"]],
    });

    if (existingAttempt) {
      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.reused",
        entity_type:   "payment_attempt",
        entity_id:     String(existingAttempt.id),
        status:        "success",
        severity:      "low",
        metadata:      { orderId, provider: existingAttempt.provider, existingStatus: existingAttempt.status },
      });

      res.status(200).json({
        ok:   true,
        code: "PAYMENT_REUSED",
        paymentAttempt: {
          id:              existingAttempt.id,
          status:          existingAttempt.status,
          provider:        existingAttempt.provider,
          amount_expected: Number(existingAttempt.amount_expected),
          currency:        existingAttempt.currency,
        },
        checkout: buildCheckoutPayload(existingAttempt),
      });
      return;
    }

    // ── Risk evaluation ───────────────────────────────────────────────────
    const riskResult = await evaluatePaymentAttempt({
      userId,
      ip,
      orderId,
      amount:         Number(order.total_amount),
      idempotencyKey,
    });

    if (riskResult.decision === "deny") {
      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.denied",
        entity_type:   "order",
        entity_id:     String(orderId),
        status:        "blocked",
        severity:      "high",
        metadata:      { reason: riskResult.reason, riskLevel: riskResult.riskLevel, provider },
      });
      res.status(403).json({
        ok:      false,
        code:    "PAYMENT_DENIED",
        message: "Intento de pago rechazado por política de seguridad",
      });
      return;
    }

    // ── Determine attempt status and order transition ─────────────────────
    const attemptStatus = riskResult.decision === "manual_review" ? "manual_review" : "pending";

    // ── Create attempt (idempotency_key unique at DB level) ───────────────
    let attempt: PaymentAttempt;
    try {
      attempt = await PaymentAttempt.create({
        order_id:            orderId,
        provider,
        provider_intent_id:  "pending_provider_binding",
        provider_session_id: null,
        idempotency_key:     idempotencyKey,
        amount_expected:     Number(order.total_amount),
        currency:            order.currency,
        status:              attemptStatus,
        failure_reason:      null,
        metadata: {
          riskLevel:  riskResult.riskLevel,
          riskReason: riskResult.reason,
        },
      });

      await attempt.update({
        provider_intent_id: buildProviderIntentId(provider, attempt.id),
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        // Idempotency replay — return the existing attempt with checkout shape
        const existing = await PaymentAttempt.findOne({
          where: { idempotency_key: idempotencyKey },
        });
        if (!existing) {
          res.status(500).json({ ok: false, message: "Error interno" });
          return;
        }
        void logAuditEventFromRequest(req, {
          actor_user_id: userId,
          actor_role:    req.user!.role,
          action:        "payment.intent.reused",
          entity_type:   "payment_attempt",
          entity_id:     String(existing.id),
          status:        "success",
          severity:      "low",
          metadata:      { orderId, idempotent: true },
        });
        res.status(200).json({
          ok:   true,
          code: "PAYMENT_REUSED",
          paymentAttempt: {
            id:              existing.id,
            status:          existing.status,
            provider:        existing.provider,
            amount_expected: Number(existing.amount_expected),
            currency:        existing.currency,
          },
          checkout: buildCheckoutPayload(existing),
        });
        return;
      }
      throw err;
    }

    // ── If manual review required: update order status ────────────────────
    if (riskResult.decision === "manual_review") {
      await order.update({ status: "manual_review", review_status: "pending" });

      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role:    req.user!.role,
        action:        "payment.intent.manual_review_required",
        entity_type:   "payment_attempt",
        entity_id:     String(attempt.id),
        status:        "success",
        severity:      "medium",
        metadata:      {
          orderId,
          provider,
          amount:    Number(order.total_amount),
          riskLevel: riskResult.riskLevel,
        },
      });

      res.status(202).json({
        ok:      true,
        code:    "PAYMENT_MANUAL_REVIEW",
        message: "Tu pago está en revisión. Te notificaremos cuando sea aprobado.",
        paymentAttempt: {
          id:              attempt.id,
          status:          attempt.status,
          provider:        attempt.provider,
          amount_expected: Number(attempt.amount_expected),
          currency:        attempt.currency,
        },
        checkout: buildCheckoutPayload(attempt),
      });
      return;
    }

    // ── If the order was previously in payment_failed, reset to pending ───
    if (order.status === "payment_failed") {
      await order.update({ status: "pending_payment" });
    }

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role:    req.user!.role,
      action:        "payment.intent.created",
      entity_type:   "payment_attempt",
      entity_id:     String(attempt.id),
      status:        "success",
      severity:      "low",
      metadata:      {
        orderId,
        provider,
        amount:    Number(order.total_amount),
        currency:  order.currency,
        riskLevel: riskResult.riskLevel,
      },
    });

    res.status(201).json({
      ok: true,
      paymentAttempt: {
        id:              attempt.id,
        status:          attempt.status,
        provider:        attempt.provider,
        amount_expected: Number(attempt.amount_expected),
        currency:        attempt.currency,
      },
      checkout: buildCheckoutPayload(attempt),
    });
  } catch (err) {
    console.error("createPaymentAttempt error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/* ============================================================
   POST /api/payments/webhooks/:provider
   Receive and process inbound payment provider webhooks.

   - Body must be raw Buffer (express.raw() applied at route level)
   - Signature validated per provider via HMAC-SHA256
   - Duplicate events silently ignored (idempotency)
   - ONLY this endpoint may move an order to "paid"
============================================================ */
export const handleWebhook: RequestHandler = async (req, res) => {
  try {
    const providerParam = req.params.provider;
    const provider = typeof providerParam === "string"
      ? providerParam.trim().toLowerCase()
      : "";

    if (!provider || !SUPPORTED_PROVIDERS.has(provider)) {
      res.status(400).json({ ok: false, message: "Proveedor desconocido" });
      return;
    }

    const signatureHeader = resolveSignatureHeader(provider);
    const signature = (req.headers[signatureHeader] as string | undefined) ?? "";

    if (!signature) {
      res.status(400).json({ ok: false, message: "Firma de webhook ausente" });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ ok: false, message: "Cuerpo de webhook inválido" });
      return;
    }

    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      res.status(400).json({ ok: false, message: "Webhook payload inválido" });
      return;
    }

    const webhookEventId = extractEventId(provider, parsedPayload);
    const eventType      = extractEventType(provider, parsedPayload);

    if (!webhookEventId || !eventType) {
      res.status(400).json({ ok: false, message: "Webhook event_id o event_type ausente" });
      return;
    }

    void logAuditEventFromRequest(req, {
      actor_user_id: null,
      actor_role:    "system",
      action:        "payment.webhook.received",
      status:        "success",
      severity:      "low",
      metadata:      { provider, webhookEventId, eventType },
    });

    const result = await processWebhookEvent({
      provider,
      webhookEventId,
      eventType,
      rawBody,
      signature,
      parsedPayload: normalizePayload(provider, parsedPayload),
    });

    if (result.outcome === "duplicate_ignored") {
      void logAuditEventFromRequest(req, {
        actor_user_id: null,
        actor_role:    "system",
        action:        "payment.webhook.duplicate_ignored",
        status:        "blocked",
        severity:      "low",
        metadata:      { provider, webhookEventId },
      });
      // Always 200 to prevent provider retries on duplicates
      res.status(200).json({ ok: true, outcome: "duplicate_ignored" });
      return;
    }

    if (result.outcome === "failed") {
      void logAuditEventFromRequest(req, {
        actor_user_id: null,
        actor_role:    "system",
        action:        "payment.failed",
        status:        "failed",
        severity:      "medium",
        metadata:      { provider, webhookEventId, reason: result.reason },
      });
      // 400 tells provider NOT to retry; use 500 for transient errors you want retried
      res.status(400).json({ ok: false, outcome: "failed", reason: result.reason });
      return;
    }

    // Processed successfully — log the outcome
    const auditAction = result.newOrderStatus === "paid"
      ? "payment.confirmed"
      : result.newOrderStatus === "payment_failed"
        ? "payment.failed"
        : "payment.webhook.verified";

    void logAuditEventFromRequest(req, {
      actor_user_id: null,
      actor_role:    "system",
      action:        auditAction,
      entity_type:   "order",
      entity_id:     String(result.orderId),
      status:        result.newOrderStatus === "payment_failed" ? "failed" : "success",
      severity:      result.newOrderStatus === "payment_failed" ? "medium" : "low",
      metadata:      { provider, webhookEventId, eventType, newOrderStatus: result.newOrderStatus },
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: null,
      actor_role:    "system",
      action:        "payment.webhook.verified",
      status:        "success",
      severity:      "low",
      metadata:      { provider, webhookEventId, eventType },
    });

    res.status(200).json({ ok: true, outcome: "processed" });
  } catch (err) {
    console.error("handleWebhook error:", err);
    // 500 causes the provider to retry — appropriate for unexpected server errors
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider-specific helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveSignatureHeader(provider: string): string {
  switch (provider) {
    case "stripe":       return "stripe-signature";
    case "paypal":       return "paypal-transmission-sig";
    case "mercadopago":  return "x-signature";
    default:             return "x-webhook-signature";
  }
}

function extractEventId(
  provider: string,
  payload:  Record<string, unknown>,
): string | null {
  switch (provider) {
    case "stripe":
      return (payload.id as string | undefined) ?? null;
    case "paypal":
      return (payload.id as string | undefined) ?? null;
    case "mercadopago":
      return (payload.id as string | undefined)
        ?? ((payload.data as Record<string, unknown> | undefined)?.id as string | undefined)
        ?? null;
    default:
      return (payload.event_id as string | undefined)
        ?? (payload.id as string | undefined)
        ?? null;
  }
}

function extractEventType(
  provider: string,
  payload:  Record<string, unknown>,
): string | null {
  switch (provider) {
    case "stripe":
      return (payload.type as string | undefined) ?? null;
    case "paypal":
      return (payload.event_type as string | undefined) ?? null;
    case "mercadopago":
      return (payload.type as string | undefined) ?? null;
    default:
      return (payload.event_type as string | undefined)
        ?? (payload.type as string | undefined)
        ?? null;
  }
}

function normalizePayload(
  provider: string,
  payload:  Record<string, unknown>,
): import("../services/paymentWebhook.service").WebhookPayload {
  switch (provider) {
    case "stripe": {
      const obj = payload.data as Record<string, unknown> | undefined;
      const pi  = obj?.object as Record<string, unknown> | undefined;
      return {
        intentId:   (pi?.id ?? payload.id) as string | undefined,
        sessionId:  undefined,
        amountPaid: pi?.amount_received
          ? Number(pi.amount_received) / 100  // Stripe amounts are in cents
          : undefined,
        currency:   (pi?.currency as string | undefined)?.toUpperCase(),
        status:     pi?.status as string | undefined,
        ...payload,
      };
    }
    default:
      return payload as import("../services/paymentWebhook.service").WebhookPayload;
  }
}
