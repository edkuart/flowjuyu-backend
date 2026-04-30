// src/controllers/sellerAiCredits.controller.ts
//
// Seller-facing: balance, packages, purchase requests, transaction history.
// Admin-facing:  approve/reject requests, manual grant, list all pending.

import type { Request, Response, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import {
  getAiCreditsBalance,
  listAiCreditTransactions,
  listAiCreditPackages,
  createPurchaseRequest,
  listPurchaseRequestsBySeller,
  listPendingPurchaseRequests,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  addAiCredits,
  cancelPurchaseRequestBySeller,
  InsufficientAiCreditsError,
  AiCreditsNotFoundError,
} from "../services/aiCredits.service";
import {
  captureAiCreditPaypalCheckout,
  createAiCreditCheckoutSession,
  handleAiCreditRecurrenteWebhook,
  handleAiCreditStripeWebhook,
  listAiCreditPaymentOptions,
} from "../services/aiCreditCheckout.service";
import { normalizePaymentProvider } from "../services/payments/paymentProviders.service";
import { logAuditEventFromRequest } from "../services/audit.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(err: unknown, res: Response): void {
  if (err instanceof AiCreditsNotFoundError) {
    res
      .status(404)
      .json({ ok: false, code: "SELLER_NOT_FOUND", message: err.message });
    return;
  }
  if (err instanceof InsufficientAiCreditsError) {
    res.status(402).json({
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      message: err.message,
      balance: err.balance,
      required: err.required,
    });
    return;
  }
  throw err;
}

function parseIntParam(val: unknown, fallback: number): number {
  const n = parseInt(val as string, 10);
  return isNaN(n) ? fallback : Math.max(0, n);
}

export const aiCreditCheckoutRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id ?? req.ip),
  message: {
    ok: false,
    code: "RATE_LIMITED",
    message: "Demasiadas solicitudes. Espera un momento.",
  },
});

// ─── Seller endpoints ─────────────────────────────────────────────────────────

/**
 * GET /api/seller/ai-credits/balance
 * Returns the seller's current AI credit balance and cost catalog.
 */
export async function getSellerAiCreditsBalance(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const balance = await getAiCreditsBalance(sellerId);
    res.json({ ok: true, balance });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * GET /api/seller/ai-credits/packages
 * Returns all active purchasable credit packages.
 */
export async function getAiCreditPackages(
  req: Request,
  res: Response,
): Promise<void> {
  const packages = await listAiCreditPackages();
  res.json({ ok: true, packages });
}

/**
 * GET /api/seller/ai-credits/transactions
 * Returns paginated transaction history for the logged-in seller.
 */
export async function getSellerAiCreditTransactions(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const limit = Math.min(parseIntParam(req.query.limit, 20), 100);
    const offset = parseIntParam(req.query.offset, 0);
    const { rows, total } = await listAiCreditTransactions(
      sellerId,
      limit,
      offset,
    );
    res.json({ ok: true, transactions: rows, total, limit, offset });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * POST /api/seller/ai-credits/purchase-requests
 * Seller requests to buy a credit package and reports their payment.
 * Body: { packageId: number, paymentNote?: string }
 */
export async function requestAiCreditPurchase(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const { packageId, paymentNote } = req.body as {
      packageId: number;
      paymentNote?: string;
    };

    if (!packageId || typeof packageId !== "number") {
      res.status(400).json({
        ok: false,
        code: "INVALID_PACKAGE",
        message: "packageId requerido y debe ser número",
      });
      return;
    }

    const request = await createPurchaseRequest(
      sellerId,
      packageId,
      paymentNote ?? null,
    );
    res.status(201).json({ ok: true, request });
  } catch (err) {
    if (err instanceof Error && err.message.includes("no encontrado")) {
      res
        .status(404)
        .json({ ok: false, code: "PACKAGE_NOT_FOUND", message: err.message });
      return;
    }
    handleError(err, res);
  }
}

/**
 * POST /api/seller/ai-credits/checkout
 * Creates a hosted checkout session for an AI credit package.
 * Body: { packageId: number }
 */
export async function createAiCreditCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const rawPackageId =
      (req.body as { packageId?: unknown; package_id?: unknown })?.packageId ??
      (req.body as { package_id?: unknown })?.package_id;
    const packageId = Number(rawPackageId);

    if (!Number.isInteger(packageId) || packageId <= 0) {
      res.status(400).json({
        ok: false,
        code: "INVALID_PACKAGE",
        message: "packageId requerido y debe ser número",
      });
      return;
    }

    const body = req.body as {
      provider?: unknown;
      returnTo?: unknown;
      return_to?: unknown;
      source?: unknown;
    };
    const provider = normalizePaymentProvider(body.provider);
    if ((req.body as { provider?: unknown })?.provider && !provider) {
      res.status(400).json({
        ok: false,
        code: "INVALID_PROVIDER",
        message: "Proveedor de pago no soportado",
      });
      return;
    }

    const result = await createAiCreditCheckoutSession({
      sellerId,
      packageId,
      provider: provider ?? undefined,
      returnTo:
        typeof (body.returnTo ?? body.return_to) === "string"
          ? String(body.returnTo ?? body.return_to)
          : undefined,
      source: typeof body.source === "string" ? body.source : undefined,
    });
    res.status(201).json({
      ok: true,
      url: result.url,
      sessionId: result.sessionId,
      requestId: result.requestId,
      provider: result.provider,
      requiresCapture: result.requiresCapture,
    });
  } catch (err: any) {
    console.error("createAiCreditCheckout error:", err);
    const message =
      err instanceof Error && err.message.includes("Paquete")
        ? err.message
        : "Error al crear la sesión de pago. Intenta de nuevo.";
    const status =
      err instanceof Error && err.message.includes("no configurad") ? 503 : 500;
    res.status(status).json({ ok: false, message });
  }
}

/**
 * GET /api/seller/ai-credits/payment-options
 * Lists configured hosted checkout providers.
 */
export async function getAiCreditPaymentOptions(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json({ ok: true, providers: listAiCreditPaymentOptions() });
}

/**
 * POST /api/seller/ai-credits/capture
 * Captures PayPal after the hosted approval redirect.
 * Body: { provider: "paypal", order_id: string }
 */
export async function captureAiCreditCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const provider = normalizePaymentProvider(
      (req.body as { provider?: unknown })?.provider,
    );
    const orderId =
      (req.body as { order_id?: unknown; orderId?: unknown })?.order_id ??
      (req.body as { orderId?: unknown })?.orderId;

    if (provider !== "paypal") {
      res.status(400).json({
        ok: false,
        code: "INVALID_PROVIDER",
        message: "Solo PayPal requiere captura desde el frontend",
      });
      return;
    }
    if (typeof orderId !== "string" || !orderId.trim()) {
      res.status(400).json({
        ok: false,
        code: "INVALID_ORDER",
        message: "order_id requerido",
      });
      return;
    }

    const result = await captureAiCreditPaypalCheckout({
      sellerId,
      orderId: orderId.trim(),
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("captureAiCreditCheckout error:", err);
    res.status(500).json({
      ok: false,
      message: "Error al confirmar el pago. Intenta de nuevo.",
    });
  }
}

/**
 * POST /api/seller/ai-credits/cancel
 * Marks unpaid hosted checkouts as rejected when the seller cancels/returns.
 * Paid sessions stay untouched because only pending/under_review rows change.
 */
export async function cancelAiCreditCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const requestId = String(
      (req.body as { requestId?: unknown; request_id?: unknown })?.requestId ??
        (req.body as { request_id?: unknown })?.request_id ??
        "",
    ).trim();

    if (!requestId) {
      res.status(400).json({
        ok: false,
        code: "REQUEST_ID_REQUIRED",
        message: "requestId requerido",
      });
      return;
    }

    const request = await cancelPurchaseRequestBySeller({
      requestId,
      sellerId,
      reason: "Checkout cancelado o abandonado por el cliente",
    });

    res.json({ ok: true, outcome: request ? "cancelled" : "ignored", request });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * POST /api/webhooks/stripe/ai-credits
 * Public Stripe webhook. Requires raw body for signature verification.
 */
export const handleAiCreditWebhook: RequestHandler = async (req, res) => {
  const signature =
    (req.headers["stripe-signature"] as string | undefined) ?? "";

  if (!signature) {
    res
      .status(400)
      .json({ ok: false, message: "stripe-signature header ausente" });
    return;
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    res.status(400).json({ ok: false, message: "Cuerpo vacío" });
    return;
  }

  try {
    const result = await handleAiCreditStripeWebhook(rawBody, signature);
    console.log(
      "[stripe-ai-credits] outcome:",
      result.outcome,
      result.detail ?? "",
    );
    res.status(200).json({ ok: true, outcome: result.outcome });
  } catch (err: any) {
    console.error("[stripe-ai-credits] error:", err.message);
    const isSignatureError =
      err.message?.includes("Firma") || err.message?.includes("signature");
    res
      .status(isSignatureError ? 400 : 500)
      .json({ ok: false, message: err.message });
  }
};

/**
 * POST /api/webhooks/recurrente/ai-credits
 * Public Recurrente webhook. Requires raw body for Svix signature verification.
 */
export const handleAiCreditRecurrenteWebhookRequest: RequestHandler = async (
  req,
  res,
) => {
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    res.status(400).json({ ok: false, message: "Cuerpo vacío" });
    return;
  }

  try {
    const result = await handleAiCreditRecurrenteWebhook(rawBody, req.headers);
    console.log(
      "[recurrente-ai-credits] outcome:",
      result.outcome,
      result.detail ?? "",
    );
    res.status(200).json({ ok: true, outcome: result.outcome });
  } catch (err: any) {
    console.error("[recurrente-ai-credits] error:", err.message);
    const isSignatureError =
      err.message?.includes("Firma") ||
      err.message?.includes("Svix") ||
      err.message?.includes("expirado") ||
      err.message?.includes("signature");
    res
      .status(isSignatureError ? 400 : 500)
      .json({ ok: false, message: err.message });
  }
};

/**
 * GET /api/seller/ai-credits/purchase-requests
 * Lists the seller's own purchase requests (history).
 */
export async function listSellerAiCreditPurchaseRequests(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sellerId = req.user!.id;
    const limit = Math.min(parseIntParam(req.query.limit, 20), 100);
    const offset = parseIntParam(req.query.offset, 0);
    const { rows, total } = await listPurchaseRequestsBySeller(
      sellerId,
      limit,
      offset,
    );
    res.json({ ok: true, requests: rows, total, limit, offset });
  } catch (err) {
    handleError(err, res);
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/ai-credits/purchase-requests
 * Lists all pending/under_review purchase requests.
 * Query: { status?, limit?, offset? }
 */
export async function adminListAiCreditPurchaseRequests(
  req: Request,
  res: Response,
): Promise<void> {
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseIntParam(req.query.limit, 50), 200);
  const offset = parseIntParam(req.query.offset, 0);
  const { rows, total } = await listPendingPurchaseRequests(
    status,
    limit,
    offset,
  );
  res.json({ ok: true, requests: rows, total, limit, offset });
}

/**
 * POST /api/admin/ai-credits/purchase-requests/:requestId/approve
 * Approves a pending request → credits are added to seller's wallet.
 */
export async function adminApproveAiCreditRequest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const adminId = req.user!.id;
    const requestId = String(req.params.requestId);
    const { request, balanceAfter } = await approvePurchaseRequest(
      requestId,
      adminId,
    );
    await logAuditEventFromRequest(req, {
      actor_user_id: adminId,
      actor_role: "admin",
      action: "admin.ai_credits.purchase_request.approve.success",
      entity_type: "ai_credit_purchase_request",
      entity_id: requestId,
      target_user_id: request.seller_id,
      status: "success",
      severity: "medium",
      metadata: {
        sellerId: request.seller_id,
        credits: request.credits,
        priceGtq: request.price_gtq,
        balanceAfter,
      },
    });
    res.json({ ok: true, request, balanceAfter });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("no encontrada")) {
        res
          .status(404)
          .json({ ok: false, code: "REQUEST_NOT_FOUND", message: err.message });
        return;
      }
      if (
        err.message.includes("ya aprobada") ||
        err.message.includes("ya rechazada")
      ) {
        res
          .status(409)
          .json({ ok: false, code: "INVALID_STATE", message: err.message });
        return;
      }
    }
    throw err;
  }
}

/**
 * POST /api/admin/ai-credits/purchase-requests/:requestId/reject
 * Rejects a pending request.
 * Body: { reason: string }
 */
export async function adminRejectAiCreditRequest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const adminId = req.user!.id;
    const requestId = String(req.params.requestId);
    const { reason } = req.body as { reason: string };

    if (!reason?.trim()) {
      res.status(400).json({
        ok: false,
        code: "REASON_REQUIRED",
        message: "Se requiere motivo de rechazo",
      });
      return;
    }

    const request = await rejectPurchaseRequest(requestId, adminId, reason);
    await logAuditEventFromRequest(req, {
      actor_user_id: adminId,
      actor_role: "admin",
      action: "admin.ai_credits.purchase_request.reject.success",
      entity_type: "ai_credit_purchase_request",
      entity_id: requestId,
      target_user_id: request.seller_id,
      status: "success",
      severity: "medium",
      metadata: {
        sellerId: request.seller_id,
        credits: request.credits,
        priceGtq: request.price_gtq,
        reason,
      },
    });
    res.json({ ok: true, request });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("no encontrada")) {
        res
          .status(404)
          .json({ ok: false, code: "REQUEST_NOT_FOUND", message: err.message });
        return;
      }
      if (
        err.message.includes("ya aprobada") ||
        err.message.includes("ya rechazada")
      ) {
        res
          .status(409)
          .json({ ok: false, code: "INVALID_STATE", message: err.message });
        return;
      }
    }
    throw err;
  }
}

/**
 * POST /api/admin/ai-credits/grant/:sellerId
 * Manually grants AI credits to a seller (no payment required).
 * Body: { credits: number, reason: string }
 */
export async function adminGrantAiCredits(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const adminId = req.user!.id;
    const sellerId = Number(req.params.sellerId);
    const { credits, reason } = req.body as { credits: number; reason: string };

    if (!credits || typeof credits !== "number" || credits <= 0) {
      res.status(400).json({
        ok: false,
        code: "INVALID_CREDITS",
        message: "credits debe ser un número positivo",
      });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({
        ok: false,
        code: "REASON_REQUIRED",
        message: "Se requiere motivo del grant",
      });
      return;
    }

    const { balanceAfter, txId } = await addAiCredits(
      sellerId,
      credits,
      "manual_grant",
      `Grant manual por admin (${adminId}): ${reason}`,
      "admin_grant",
      String(adminId),
    );

    res.json({ ok: true, sellerId, credits, balanceAfter, txId });
  } catch (err) {
    handleError(err, res);
  }
}
