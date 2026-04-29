export type PaymentProviderId = "recurrente" | "paypal" | "stripe";

export type CheckoutPurpose = "ai_credits" | "video_credits" | "seller_billing";

export interface PaymentProviderOption {
  id: PaymentProviderId;
  label: string;
  description: string;
  available: boolean;
  preferred?: boolean;
  unavailableReason?: string;
  supports: CheckoutPurpose[];
}

export interface CreatePaymentCheckoutInput {
  provider: PaymentProviderId;
  purpose: CheckoutPurpose;
  referenceId: string;
  amountCents: number;
  currency: "GTQ" | "USD";
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentCheckoutResult {
  provider: PaymentProviderId;
  providerSessionId: string;
  checkoutUrl: string;
  requiresCapture: boolean;
}

export interface PaymentProviderAdapter {
  id: PaymentProviderId;
  label: string;
  description: string;
  supports: CheckoutPurpose[];
  isConfigured(): boolean;
  unavailableReason(): string | undefined;
  createCheckout(
    input: CreatePaymentCheckoutInput,
  ): Promise<CreatePaymentCheckoutResult>;
}
