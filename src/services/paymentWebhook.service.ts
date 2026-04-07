// src/services/paymentWebhook.service.ts
//
// CRITICAL INVARIANTS:
//   - Only a verified webhook may move an order to "paid".
//   - Duplicate webhook events are silently ignored (idempotency).
//   - Amount and currency from the webhook are validated against the DB record.
//   - Signature verification is required in production; stub-safe in dev.

import crypto from "crypto";
import { UniqueConstraintError } from "sequelize";
import ProcessedWebhook from "../models/ProcessedWebhook.model";
import PaymentAttempt   from "../models/PaymentAttempt.model";
import Order            from "../models/Order.model";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
export interface InboundWebhookEvent {
  provider:         string;
  webhookEventId:   string;
  eventType:        string;
  rawBody:          Buffer;
  signature:        string;        // value from the provider's header
  parsedPayload:    WebhookPayload;
}

export interface WebhookPayload {
  intentId?:    string;   // provider_intent_id
  sessionId?:   string;   // provider_session_id
  amountPaid?:  number;   // in smallest currency unit or decimal — normalized below
  currency?:    string;
  status?:      string;
  reason?:      string;
  [key: string]: unknown;
}

export type WebhookProcessResult =
  | { outcome: "processed"; orderId: number; newOrderStatus: string }
  | { outcome: "duplicate_ignored"; webhookEventId: string }
  | { outcome: "failed"; reason: string };

// ─────────────────────────────────────────────────────────────────────────────
// verifyWebhookSignature
//
// Validates the HMAC-SHA256 signature sent by the payment provider.
// Uses the PAYMENT_WEBHOOK_SECRET env var.
//
// In development (NODE_ENV !== "production") and when the secret is absent,
// verification is bypassed — this allows integration testing without real keys.
// ─────────────────────────────────────────────────────────────────────────────
export function verifyWebhookSignature(
  rawBody:   Buffer,
  signature: string,
  provider:  string,
): boolean {
  const secret = process.env[`PAYMENT_WEBHOOK_SECRET_${provider.toUpperCase()}`]
    ?? process.env.PAYMENT_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[webhook] No secret configured for provider "${provider}". Rejecting.`);
      return false;
    }
    // Dev/test: allow unsigned webhooks when no secret is set
    console.warn(`[webhook] No secret for "${provider}" — signature check bypassed (dev mode).`);
    return true;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison prevents timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace(/^sha256=/, ""), "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// markWebhookProcessed
//
// Inserts a ProcessedWebhook row atomically.
// Returns false if a duplicate was detected (UNIQUE constraint violation).
// Throws on any other error.
// ─────────────────────────────────────────────────────────────────────────────
export async function markWebhookProcessed(
  provider:       string,
  webhookEventId: string,
  eventType:      string,
  rawBody:        Buffer,
  status:         "processed" | "failed" | "ignored",
): Promise<boolean> {
  const payloadHash = crypto
    .createHash("sha256")
    .update(rawBody)
    .digest("hex");

  try {
    await ProcessedWebhook.create({
      provider,
      webhook_event_id: webhookEventId,
      event_type:       eventType,
      payload_hash:     payloadHash,
      status,
      processed_at:     status === "processed" ? new Date() : null,
    });
    return true;
  } catch (err) {
    if (err instanceof UniqueConstraintError) return false;  // duplicate
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// processWebhookEvent
//
// Full pipeline:
//   1. Verify signature
//   2. Deduplicate by (provider, webhookEventId) — insert first, process second
//   3. Find PaymentAttempt by provider intent/session ID
//   4. Validate amount_expected and currency against the DB record
//   5. Move Order and PaymentAttempt to terminal state
// ─────────────────────────────────────────────────────────────────────────────
export async function processWebhookEvent(
  event: InboundWebhookEvent,
): Promise<WebhookProcessResult> {
  const { provider, webhookEventId, eventType, rawBody, signature, parsedPayload } = event;

  // ── 1. Signature verification ─────────────────────────────────────────────
  if (!verifyWebhookSignature(rawBody, signature, provider)) {
    return { outcome: "failed", reason: "Invalid webhook signature" };
  }

  // ── 2. Idempotency — attempt to claim this event ──────────────────────────
  // We insert BEFORE processing. If the row already exists the INSERT fails
  // with a UniqueConstraintError and we return duplicate_ignored immediately.
  const claimed = await markWebhookProcessed(
    provider,
    webhookEventId,
    eventType,
    rawBody,
    "processed",
  );

  if (!claimed) {
    return { outcome: "duplicate_ignored", webhookEventId };
  }

  // ── 3. Locate the PaymentAttempt ──────────────────────────────────────────
  const attempt = await findAttemptFromPayload(provider, parsedPayload);

  if (!attempt) {
    await ProcessedWebhook.update(
      { status: "failed" },
      { where: { provider, webhook_event_id: webhookEventId } },
    );
    return { outcome: "failed", reason: "PaymentAttempt not found for this event" };
  }

  const order = await Order.findByPk(attempt.order_id);

  if (!order) {
    await ProcessedWebhook.update(
      { status: "failed" },
      { where: { provider, webhook_event_id: webhookEventId } },
    );
    return { outcome: "failed", reason: "Order not found for payment attempt" };
  }

  // ── 4. Amount and currency validation ─────────────────────────────────────
  if (parsedPayload.currency) {
    const webhookCurrency = parsedPayload.currency.toUpperCase();
    if (webhookCurrency !== attempt.currency) {
      await attempt.update({ status: "failed", failure_reason: "Currency mismatch" });
      await ProcessedWebhook.update(
        { status: "failed" },
        { where: { provider, webhook_event_id: webhookEventId } },
      );
      return { outcome: "failed", reason: `Currency mismatch: expected ${attempt.currency}, got ${webhookCurrency}` };
    }
  }

  if (parsedPayload.amountPaid !== undefined) {
    const amountReceived = Number(parsedPayload.amountPaid);
    const amountExpected = Number(attempt.amount_expected);

    // Allow ±0.01 tolerance for floating point rounding from providers
    if (Math.abs(amountReceived - amountExpected) > 0.01) {
      await attempt.update({ status: "failed", failure_reason: "Amount mismatch" });
      await ProcessedWebhook.update(
        { status: "failed" },
        { where: { provider, webhook_event_id: webhookEventId } },
      );
      return {
        outcome: "failed",
        reason: `Amount mismatch: expected ${amountExpected}, got ${amountReceived}`,
      };
    }
  }

  // ── 5. Apply state transitions ────────────────────────────────────────────
  const isSuccess = isSuccessEvent(eventType, parsedPayload);
  const isFailure = isFailureEvent(eventType, parsedPayload);

  if (isSuccess) {
    if (
      order.status === "manual_review" ||
      order.review_status === "pending" ||
      order.review_status === "rejected"
    ) {
      await attempt.update({ status: "manual_review" });
      return { outcome: "processed", orderId: attempt.order_id, newOrderStatus: "manual_review" };
    }

    await attempt.update({ status: "confirmed", failure_reason: null });

    if (order.status !== "paid" && order.status !== "completed") {
      await order.update({
        status: "paid",
        review_status: order.review_status ?? "not_required",
      });
    }

    return { outcome: "processed", orderId: attempt.order_id, newOrderStatus: "paid" };
  }

  if (isFailure) {
    if (order.status === "paid" || order.status === "completed") {
      await ProcessedWebhook.update(
        { status: "ignored" },
        { where: { provider, webhook_event_id: webhookEventId } },
      );
      return { outcome: "processed", orderId: attempt.order_id, newOrderStatus: order.status };
    }

    await attempt.update({
      status:         "failed",
      failure_reason: parsedPayload.reason as string | undefined ?? eventType,
    });
    await order.update({ status: "payment_failed" });
    return { outcome: "processed", orderId: attempt.order_id, newOrderStatus: "payment_failed" };
  }

  // Unrecognised event type — mark as ignored, do not change order status
  await ProcessedWebhook.update(
    { status: "ignored" },
    { where: { provider, webhook_event_id: webhookEventId } },
  );
  return { outcome: "processed", orderId: attempt.order_id, newOrderStatus: "unchanged" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function findAttemptFromPayload(
  provider: string,
  payload:  WebhookPayload,
): Promise<PaymentAttempt | null> {
  if (payload.intentId) {
    const attempt = await PaymentAttempt.findOne({
      where: { provider, provider_intent_id: payload.intentId },
    });
    if (attempt) return attempt;
  }

  if (payload.sessionId) {
    return PaymentAttempt.findOne({
      where: { provider, provider_session_id: payload.sessionId },
    });
  }

  return null;
}

/** Success event types across common providers. Extend as providers are integrated. */
function isSuccessEvent(eventType: string, payload: WebhookPayload): boolean {
  const successTypes = new Set([
    "payment_intent.succeeded",
    "checkout.session.completed",
    "charge.succeeded",
    "payment.completed",
    "payment.confirmed",
  ]);
  return successTypes.has(eventType) || payload.status === "succeeded";
}

/** Failure event types across common providers. */
function isFailureEvent(eventType: string, payload: WebhookPayload): boolean {
  const failureTypes = new Set([
    "payment_intent.payment_failed",
    "charge.failed",
    "payment.failed",
    "payment_intent.canceled",
  ]);
  return failureTypes.has(eventType) || payload.status === "failed";
}
