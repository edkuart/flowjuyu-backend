import crypto from "crypto";
import { stripe } from "../lib/stripe";
import { captureOrder, getOrder } from "../lib/paypal";
import {
  attachProviderSessionToPurchaseRequest,
  completePurchaseRequestFromProvider,
  createPurchaseRequest,
  findPurchaseRequestByProviderSession,
  getAiCreditPackage,
  markPurchaseRequestProviderFailed,
} from "./aiCredits.service";
import {
  createPaymentCheckout,
  getDefaultPaymentProvider,
  listPaymentProviderOptions,
} from "./payments/paymentProviders.service";
import type {
  PaymentProviderId,
  PaymentProviderOption,
} from "./payments/paymentProviders.types";

function getFrontendUrl(): string {
  const configured = process.env.FRONTEND_URL?.trim();
  const fallback =
    process.env.NODE_ENV === "production"
      ? "https://www.flowjuyu.com"
      : "http://localhost:3000";

  return (configured || fallback).replace(/\/+$/, "");
}

export interface CreateAiCreditCheckoutInput {
  sellerId: number;
  packageId: number;
  provider?: PaymentProviderId;
  source?: string;
  returnTo?: string;
}

export interface CreateAiCreditCheckoutResult {
  url: string;
  sessionId: string;
  requestId: string;
  provider: PaymentProviderId;
  requiresCapture: boolean;
}

export function listAiCreditPaymentOptions(): PaymentProviderOption[] {
  return listPaymentProviderOptions("ai_credits");
}

function safeReturnTo(value: string | undefined): string {
  if (!value) return "/seller/ai-credits";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/seller/ai-credits";
  }
  if (trimmed.includes("://")) return "/seller/ai-credits";
  return trimmed.slice(0, 500);
}

export async function createAiCreditCheckoutSession(
  input: CreateAiCreditCheckoutInput,
): Promise<CreateAiCreditCheckoutResult> {
  const pkg = await getAiCreditPackage(input.packageId);
  if (!pkg) throw new Error("Paquete de créditos IA no encontrado o inactivo");

  const priceGtq = Number(pkg.price_gtq);
  if (!Number.isFinite(priceGtq) || priceGtq <= 0) {
    throw new Error("Precio del paquete IA inválido");
  }
  const provider = input.provider ?? getDefaultPaymentProvider();
  const options = listAiCreditPaymentOptions();
  const option = options.find((item) => item.id === provider);
  if (!option)
    throw new Error(`Proveedor de pago IA no soportado: ${provider}`);
  if (!option.available) {
    throw new Error(
      option.unavailableReason ?? `${option.label} no configurado`,
    );
  }

  const request = await createPurchaseRequest(
    input.sellerId,
    input.packageId,
    `Checkout ${option.label} iniciado`,
  );
  const returnTo = safeReturnTo(input.returnTo);
  const returnParam = encodeURIComponent(returnTo);
  const source = input.source?.trim().slice(0, 40) || "ai_credits";
  const paymentReturnUrl = `${getFrontendUrl()}/seller/payments/return?provider=${provider}&requestId=${encodeURIComponent(request.id)}&returnTo=${returnParam}`;

  const checkout = await createPaymentCheckout({
    provider,
    purpose: "ai_credits",
    referenceId: request.id,
    amountCents: Math.round(priceGtq * 100),
    currency: "GTQ",
    description: `Flowjuyu IA - ${pkg.name}`,
    successUrl:
      provider === "paypal"
        ? paymentReturnUrl
        : `${paymentReturnUrl}&credit_success=1`,
    cancelUrl: `${paymentReturnUrl}&credit_cancel=1`,
    metadata: {
      product: "ai_credits",
      source,
      return_to: returnTo,
      request_id: request.id,
      seller_id: String(input.sellerId),
      package_id: String(pkg.id),
      credits: String(pkg.credits),
      price_gtq_cents: String(Math.round(priceGtq * 100)),
    },
  });

  await attachProviderSessionToPurchaseRequest(
    request.id,
    checkout.provider,
    checkout.providerSessionId,
  );

  return {
    url: checkout.checkoutUrl,
    sessionId: checkout.providerSessionId,
    requestId: request.id,
    provider: checkout.provider,
    requiresCapture: checkout.requiresCapture,
  };
}

export async function captureAiCreditPaypalCheckout(input: {
  sellerId: number;
  orderId: string;
}): Promise<{
  outcome: "processed" | "duplicate" | "ignored";
  detail?: string;
  balanceAfter?: number;
}> {
  const order = await getOrder(input.orderId);
  const request = await findPurchaseRequestByProviderSession(
    "paypal",
    order.id,
  );
  if (!request) return { outcome: "ignored", detail: "request_not_found" };
  if (request.seller_id !== input.sellerId) {
    return { outcome: "ignored", detail: "seller_mismatch" };
  }
  if (order.referenceId !== request.id) {
    return { outcome: "ignored", detail: "paypal_reference_mismatch" };
  }

  const capture = await captureOrder(order.id);
  if (capture.status !== "COMPLETED") {
    await markPurchaseRequestProviderFailed(
      "paypal",
      order.id,
      `PayPal capture status: ${capture.status}`,
    );
    return { outcome: "ignored", detail: "paypal_capture_not_completed" };
  }

  return completePurchaseRequestFromProvider({
    requestId: request.id,
    provider: "paypal",
    providerSessionId: order.id,
    providerTransactionId: capture.captureId,
  });
}

export async function handleAiCreditStripeWebhook(
  rawBody: Buffer,
  signature: string,
): Promise<{
  outcome: "processed" | "duplicate" | "ignored";
  detail?: string;
}> {
  const secret =
    process.env.STRIPE_WEBHOOK_SECRET_AI_CREDITS ??
    process.env.STRIPE_WEBHOOK_SECRET_VIDEO_CREDITS ??
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[stripe-ai-credits] Webhook secret no configurado. Rechazando.",
      );
      throw new Error("Webhook secret no configurado");
    }
    console.warn(
      "[stripe-ai-credits] Secret no configurado - verificación omitida (dev).",
    );
  }

  type StripeEvent = ReturnType<typeof stripe.webhooks.constructEvent>;
  let event: StripeEvent;
  try {
    event = secret
      ? stripe.webhooks.constructEvent(rawBody, signature, secret)
      : (JSON.parse(rawBody.toString("utf-8")) as StripeEvent);
  } catch (err: any) {
    throw new Error(`Firma de webhook inválida: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Record<string, any>;
    return processCompletedSession(session);
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Record<string, any>;
    await markPurchaseRequestProviderFailed(
      "stripe",
      String(session.id),
      "Sesión de pago expirada",
    );
    return { outcome: "ignored", detail: "session_expired" };
  }

  return { outcome: "ignored", detail: event.type };
}

async function processCompletedSession(session: Record<string, any>): Promise<{
  outcome: "processed" | "duplicate" | "ignored";
  detail?: string;
}> {
  if (session.metadata?.product !== "ai_credits") {
    return { outcome: "ignored", detail: "non_ai_credit_checkout" };
  }

  const requestId = session.metadata?.request_id;
  if (!requestId) {
    console.error(
      "[stripe-ai-credits] Metadata incompleta en session",
      session.id,
      session.metadata,
    );
    return { outcome: "ignored", detail: "incomplete_metadata" };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const result = await completePurchaseRequestFromProvider({
    requestId,
    provider: "stripe",
    providerSessionId: String(session.id),
    providerTransactionId: paymentIntentId,
  });

  console.log(
    `[stripe-ai-credits] outcome=${result.outcome} request=${requestId} session=${session.id}`,
  );
  return { outcome: result.outcome, detail: result.detail };
}

export async function handleAiCreditRecurrenteWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<{
  outcome: "processed" | "duplicate" | "ignored";
  detail?: string;
}> {
  verifyRecurrenteWebhook(rawBody, headers);

  const payload = JSON.parse(rawBody.toString("utf-8")) as Record<string, any>;
  const eventType = payload.event_type ?? payload.type ?? payload.event;
  const checkout = payload.checkout ?? payload.data?.checkout ?? {};
  const metadata =
    checkout.metadata ?? payload.metadata ?? payload.data?.metadata ?? {};

  if (metadata.product && metadata.product !== "ai_credits") {
    return { outcome: "ignored", detail: "non_ai_credit_checkout" };
  }

  const requestId = metadata.request_id;
  const checkoutId =
    checkout.id ??
    payload.checkout_id ??
    payload.data?.checkout_id ??
    requestId;
  const paymentId =
    payload.id ??
    checkout.payment?.id ??
    payload.payment?.id ??
    payload.data?.id ??
    null;

  if (!requestId) {
    console.error("[recurrente-ai-credits] Metadata incompleta", payload);
    return { outcome: "ignored", detail: "incomplete_metadata" };
  }

  if (eventType === "payment_intent.succeeded") {
    const result = await completePurchaseRequestFromProvider({
      requestId: String(requestId),
      provider: "recurrente",
      providerSessionId: String(checkoutId),
      providerTransactionId: paymentId ? String(paymentId) : null,
    });
    console.log(
      `[recurrente-ai-credits] outcome=${result.outcome} request=${requestId} checkout=${checkoutId}`,
    );
    return { outcome: result.outcome, detail: result.detail };
  }

  if (eventType === "payment_intent.failed") {
    await markPurchaseRequestProviderFailed(
      "recurrente",
      String(checkoutId),
      payload.failure_reason ?? "Pago rechazado por Recurrente",
    );
    return { outcome: "ignored", detail: "payment_failed" };
  }

  return { outcome: "ignored", detail: String(eventType ?? "unknown_event") };
}

function verifyRecurrenteWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): void {
  const secret = process.env.RECURRENTE_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RECURRENTE_WEBHOOK_SECRET no configurada");
    }
    console.warn(
      "[recurrente-ai-credits] Secret no configurado - verificación omitida (dev).",
    );
    return;
  }

  const svixId = firstHeader(headers["svix-id"]);
  const svixTimestamp = firstHeader(headers["svix-timestamp"]);
  const svixSignature = firstHeader(headers["svix-signature"]);
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Headers Svix ausentes");
  }

  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) {
    throw new Error("svix-timestamp inválido");
  }

  const maxSkewSeconds = Number(
    process.env.RECURRENTE_WEBHOOK_MAX_SKEW_SECONDS ?? 300,
  );
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > maxSkewSeconds) {
    throw new Error("Webhook Recurrente expirado");
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString("utf-8")}`;
  const secretPart = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  const expected = crypto
    .createHmac("sha256", Buffer.from(secretPart, "base64"))
    .update(signedContent)
    .digest("base64");

  const signatures = svixSignature
    .split(" ")
    .flatMap((part) => part.split(","))
    .filter((part) => part && part !== "v1");

  const expectedBuffer = Buffer.from(expected);
  const isValid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature);
    return (
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    );
  });

  if (!isValid) throw new Error("Firma de webhook Recurrente inválida");
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
