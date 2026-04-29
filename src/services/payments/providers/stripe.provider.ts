import { stripe } from "../../../lib/stripe";
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

export const stripeProvider: PaymentProviderAdapter = {
  id: "stripe",
  label: "Stripe",
  description: "Checkout internacional con tarjeta.",
  supports: ["ai_credits", "seller_billing"],
  isConfigured() {
    const key = process.env.STRIPE_SECRET_KEY;
    return Boolean(key && !key.includes("placeholder"));
  },
  unavailableReason() {
    return this.isConfigured() ? undefined : "STRIPE_SECRET_KEY no configurada";
  },
  async createCheckout(
    input: CreatePaymentCheckoutInput,
  ): Promise<CreatePaymentCheckoutResult> {
    if (!this.isConfigured())
      throw new Error("STRIPE_SECRET_KEY no configurada");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: input.description,
            },
            unit_amount: toUsdCents(input),
          },
          quantity: 1,
        },
      ],
      metadata: {
        ...input.metadata,
        provider: "stripe",
        purpose: input.purpose,
        reference_id: input.referenceId,
      },
      client_reference_id: input.referenceId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    if (!session.url) throw new Error("Stripe no devolvió una URL de checkout");

    return {
      provider: "stripe",
      providerSessionId: session.id,
      checkoutUrl: session.url,
      requiresCapture: false,
    };
  },
};
