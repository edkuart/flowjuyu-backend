// Video credit purchase via PayPal Orders API v2.
//
// Flow:
//   1. Seller selects a package → createCheckoutSession() → returns PayPal approve URL
//   2. Seller pays on PayPal-hosted page → PayPal redirects back with ?token=ORDER_ID
//   3. Frontend calls POST /api/seller/video-credits/capture (authenticated)
//   4. Backend verifies order belongs to this user, captures, adds GTQ credits
//
// INVARIANTS:
//   - Prices are ALWAYS read from CREDIT_PACKAGES, never from the client.
//   - Credits are ONLY added after a confirmed PayPal capture, never from the frontend.
//   - Duplicate captures rejected via unique constraint on provider_transaction_id.

import { createOrder, captureOrder, getOrder } from "../../lib/paypal";
import {
  CREDIT_PACKAGES,
  isValidPackageId,
} from "../../config/videoCreditPackages";
import VideoCreditTransaction from "../../models/VideoCreditTransaction.model";
import { addCredits } from "./videoCredit.service";

function getFrontendUrl(): string {
  const configured = process.env.FRONTEND_URL?.trim();
  const fallback =
    process.env.NODE_ENV === "production"
      ? "https://www.flowjuyu.com"
      : "http://localhost:3000";

  return (configured || fallback).replace(/\/+$/, "");
}

// ─── Create checkout ───────────────────────────────────────────────────────────

export interface CreateCheckoutInput {
  userId: number;
  packageId: string;
  projectId: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<{ approveUrl: string; orderId: string }> {
  const { userId, packageId, projectId } = input;

  if (!isValidPackageId(packageId)) {
    throw new Error(`Paquete no válido: ${packageId}`);
  }

  const pkg = CREDIT_PACKAGES[packageId];

  const txn = await VideoCreditTransaction.create({
    user_id: userId,
    package_id: pkg.id,
    gtq_cents: pkg.gtqCents,
    amount_usd_cents: pkg.priceUsdCents,
    provider: "paypal",
    status: "pending",
  });

  const result = await createOrder({
    amountUsdCents: pkg.priceUsdCents,
    description: `${pkg.clips} · Q${(pkg.gtqCents / 100).toFixed(2)} en créditos de video`,
    referenceId: txn.id,
    returnUrl: `${getFrontendUrl()}/seller/video-studio/${projectId}`,
    cancelUrl: `${getFrontendUrl()}/seller/video-studio/${projectId}?credit_cancel=1`,
  });

  await txn.update({ provider_session_id: result.orderId });

  return { approveUrl: result.approveUrl, orderId: result.orderId };
}

// ─── Capture payment ───────────────────────────────────────────────────────────

export interface CaptureInput {
  userId: number;
  paypalOrderId: string;
}

export async function captureCreditPayment(
  input: CaptureInput,
): Promise<{ gtqCents: number; newBalance?: number }> {
  const { userId, paypalOrderId } = input;

  const txn = await VideoCreditTransaction.findOne({
    where: { provider_session_id: paypalOrderId, provider: "paypal" },
  });

  if (!txn) {
    throw Object.assign(new Error("Orden de pago no encontrada"), {
      code: "ORDER_NOT_FOUND",
    });
  }

  if (txn.user_id !== userId) {
    throw Object.assign(new Error("Acceso denegado"), { code: "FORBIDDEN" });
  }

  if (txn.status === "completed") {
    return { gtqCents: txn.gtq_cents };
  }

  if (txn.status !== "pending") {
    throw Object.assign(
      new Error(`La transacción ya no está pendiente (estado: ${txn.status})`),
      { code: "INVALID_STATUS" },
    );
  }

  // Verify PayPal's reference matches our transaction ID
  const order = await getOrder(paypalOrderId);
  if (order.referenceId !== txn.id) {
    throw Object.assign(new Error("Referencia de orden inválida"), {
      code: "REFERENCE_MISMATCH",
    });
  }

  let captureResult: { captureId: string; status: string };
  try {
    captureResult = await captureOrder(paypalOrderId);
  } catch {
    await txn.update({ status: "failed" });
    throw Object.assign(
      new Error("No se pudo capturar el pago. Intenta de nuevo o contáctanos."),
      { code: "CAPTURE_FAILED" },
    );
  }

  if (captureResult.status !== "COMPLETED") {
    await txn.update({ status: "failed" });
    throw Object.assign(
      new Error(`El pago no se completó (estado: ${captureResult.status})`),
      { code: "CAPTURE_NOT_COMPLETED" },
    );
  }

  await txn.update({
    status: "completed",
    provider_transaction_id: captureResult.captureId,
    completed_at: new Date(),
  });

  const newBalance = await addCredits(userId, txn.gtq_cents);

  console.log(
    `[paypal] Credits added: user_id=${userId}  gtq_cents=${txn.gtq_cents}  ` +
      `capture=${captureResult.captureId}  txn=${txn.id}`,
  );

  return { gtqCents: txn.gtq_cents, newBalance };
}
