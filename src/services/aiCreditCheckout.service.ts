import { stripe } from "../lib/stripe";
import {
  attachProviderSessionToPurchaseRequest,
  completePurchaseRequestFromProvider,
  createPurchaseRequest,
  getAiCreditPackage,
  markPurchaseRequestProviderFailed,
} from "./aiCredits.service";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const GTQ_PER_USD = Number(
  process.env.PAYMENT_GTQ_PER_USD ?? process.env.GTQ_PER_USD ?? 7.75,
);

export interface CreateAiCreditCheckoutInput {
  sellerId: number;
  packageId: number;
}

export interface CreateAiCreditCheckoutResult {
  url: string;
  sessionId: string;
  requestId: string;
}

function toUsdCents(priceGtq: number): number {
  if (!Number.isFinite(priceGtq) || priceGtq <= 0) {
    throw new Error("Precio del paquete IA inválido");
  }
  if (!Number.isFinite(GTQ_PER_USD) || GTQ_PER_USD <= 0) {
    throw new Error("PAYMENT_GTQ_PER_USD inválido");
  }
  return Math.max(50, Math.round((priceGtq / GTQ_PER_USD) * 100));
}

export async function createAiCreditCheckoutSession(
  input: CreateAiCreditCheckoutInput,
): Promise<CreateAiCreditCheckoutResult> {
  const pkg = await getAiCreditPackage(input.packageId);
  if (!pkg) throw new Error("Paquete de créditos IA no encontrado o inactivo");

  const priceGtq = Number(pkg.price_gtq);
  const amountUsdCents = toUsdCents(priceGtq);

  const request = await createPurchaseRequest(
    input.sellerId,
    input.packageId,
    "Checkout Stripe iniciado",
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Flowjuyu IA - ${pkg.name}`,
            description: `${pkg.credits} créditos IA · Q${priceGtq.toFixed(2)}`,
          },
          unit_amount: amountUsdCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      product: "ai_credits",
      request_id: request.id,
      seller_id: String(input.sellerId),
      package_id: String(pkg.id),
      credits: String(pkg.credits),
      price_gtq_cents: String(Math.round(priceGtq * 100)),
    },
    client_reference_id: request.id,
    success_url: `${FRONTEND_URL}/seller/ai-credits?credit_success=1`,
    cancel_url: `${FRONTEND_URL}/seller/ai-credits?credit_cancel=1`,
  });

  if (!session.url) throw new Error("Stripe no devolvió una URL de checkout");

  await attachProviderSessionToPurchaseRequest(
    request.id,
    "stripe",
    session.id,
  );

  return { url: session.url, sessionId: session.id, requestId: request.id };
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

async function processCompletedSession(
  session: Record<string, any>,
): Promise<{
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
