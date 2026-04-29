import { createOrder } from "../../../lib/paypal";
import type {
  CreatePaymentCheckoutInput,
  CreatePaymentCheckoutResult,
  PaymentProviderAdapter,
} from "../paymentProviders.types";

const GTQ_PER_USD = Number(
  process.env.PAYMENT_GTQ_PER_USD ?? process.env.GTQ_PER_USD ?? 7.75,
);

function toUsdCents(input: CreatePaymentCheckoutInput): number {
  if (input.currency === "USD") return input.amountCents;
  if (!Number.isFinite(GTQ_PER_USD) || GTQ_PER_USD <= 0) {
    throw new Error("PAYMENT_GTQ_PER_USD inválido");
  }
  return Math.max(50, Math.round(input.amountCents / GTQ_PER_USD));
}

export const paypalProvider: PaymentProviderAdapter = {
  id: "paypal",
  label: "PayPal",
  description: "PayPal o tarjeta internacional en USD.",
  supports: ["ai_credits", "video_credits", "seller_billing"],
  isConfigured() {
    return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
  },
  unavailableReason() {
    return this.isConfigured()
      ? undefined
      : "PAYPAL_CLIENT_ID / PAYPAL_SECRET no configurados";
  },
  async createCheckout(
    input: CreatePaymentCheckoutInput,
  ): Promise<CreatePaymentCheckoutResult> {
    if (!this.isConfigured()) {
      throw new Error("PAYPAL_CLIENT_ID / PAYPAL_SECRET no configurados");
    }

    const order = await createOrder({
      amountUsdCents: toUsdCents(input),
      description: input.description,
      referenceId: input.referenceId,
      returnUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    return {
      provider: "paypal",
      providerSessionId: order.orderId,
      checkoutUrl: order.approveUrl,
      requiresCapture: true,
    };
  },
};
