import { paypalProvider } from "./providers/paypal.provider";
import { recurrenteProvider } from "./providers/recurrente.provider";
import { stripeProvider } from "./providers/stripe.provider";
import type {
  CheckoutPurpose,
  CreatePaymentCheckoutInput,
  CreatePaymentCheckoutResult,
  PaymentProviderAdapter,
  PaymentProviderId,
  PaymentProviderOption,
} from "./paymentProviders.types";

const PROVIDERS: Record<PaymentProviderId, PaymentProviderAdapter> = {
  recurrente: recurrenteProvider,
  paypal: paypalProvider,
  stripe: stripeProvider,
};

export function normalizePaymentProvider(
  provider: unknown,
): PaymentProviderId | null {
  if (typeof provider !== "string") return null;
  const normalized = provider.trim().toLowerCase();
  if (
    normalized === "recurrente" ||
    normalized === "paypal" ||
    normalized === "stripe"
  ) {
    return normalized;
  }
  return null;
}

export function getDefaultPaymentProvider(): PaymentProviderId {
  return (
    normalizePaymentProvider(
      process.env.AI_CREDITS_PAYMENT_PROVIDER ??
        process.env.PAYMENT_CHECKOUT_PROVIDER,
    ) ?? "recurrente"
  );
}

export function listPaymentProviderOptions(
  purpose: CheckoutPurpose,
): PaymentProviderOption[] {
  const preferred = getDefaultPaymentProvider();
  return Object.values(PROVIDERS)
    .filter((adapter) => adapter.supports.includes(purpose))
    .map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      description: adapter.description,
      available: adapter.isConfigured(),
      preferred: adapter.id === preferred,
      unavailableReason: adapter.unavailableReason(),
      supports: adapter.supports,
    }));
}

export async function createPaymentCheckout(
  input: CreatePaymentCheckoutInput,
): Promise<CreatePaymentCheckoutResult> {
  const adapter = PROVIDERS[input.provider];
  if (!adapter || !adapter.supports.includes(input.purpose)) {
    throw new Error(`Proveedor de pago no soportado: ${input.provider}`);
  }
  return adapter.createCheckout(input);
}
