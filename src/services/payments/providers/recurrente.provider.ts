import type {
  CreatePaymentCheckoutInput,
  CreatePaymentCheckoutResult,
  PaymentProviderAdapter,
} from "../paymentProviders.types";

const RECURRENTE_API_BASE =
  process.env.RECURRENTE_API_BASE ?? "https://app.recurrente.com/api";

export const recurrenteProvider: PaymentProviderAdapter = {
  id: "recurrente",
  label: "Recurrente",
  description: "Tarjeta en quetzales para Guatemala.",
  supports: ["ai_credits", "seller_billing"],
  isConfigured() {
    return Boolean(process.env.RECURRENTE_PUBLIC_KEY);
  },
  unavailableReason() {
    return this.isConfigured()
      ? undefined
      : "RECURRENTE_PUBLIC_KEY no configurada";
  },
  async createCheckout(
    input: CreatePaymentCheckoutInput,
  ): Promise<CreatePaymentCheckoutResult> {
    const publicKey = process.env.RECURRENTE_PUBLIC_KEY;
    if (!publicKey) throw new Error("RECURRENTE_PUBLIC_KEY no configurada");

    const response = await fetch(`${RECURRENTE_API_BASE}/checkouts`, {
      method: "POST",
      headers: {
        "X-PUBLIC-KEY": publicKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            name: input.description,
            amount_in_cents: input.amountCents,
            currency: input.currency,
            quantity: 1,
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          ...input.metadata,
          provider: "recurrente",
          purpose: input.purpose,
          reference_id: input.referenceId,
        },
      }),
    });

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      any
    >;
    if (!response.ok) {
      throw new Error(
        data.message ??
          data.error ??
          `Recurrente respondió con HTTP ${response.status}`,
      );
    }

    const checkoutUrl =
      data.checkout_url ?? data.url ?? data.checkout?.checkout_url;
    const providerSessionId =
      data.id ??
      data.checkout?.id ??
      data.checkout_id ??
      data.checkout?.checkout_id ??
      input.referenceId;

    if (!checkoutUrl)
      throw new Error("Recurrente no devolvió una URL de checkout");

    return {
      provider: "recurrente",
      providerSessionId: String(providerSessionId),
      checkoutUrl: String(checkoutUrl),
      requiresCapture: false,
    };
  },
};
