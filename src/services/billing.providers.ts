import crypto from "crypto";
import type SellerInvoice from "../models/SellerInvoice.model";
import type { BillingProvider } from "../models/SellerBillingPayment.model";
import type { BillingProviderSession, GeneratePaymentLinkInput } from "./billing.types";
import { BillingDomainError } from "./billing.types";

interface CreateBillingProviderSessionInput {
  invoice: SellerInvoice;
  idempotencyKey: string;
  request: GeneratePaymentLinkInput;
}

interface BillingProviderAdapter {
  provider: BillingProvider;
  createSession(input: CreateBillingProviderSessionInput): Promise<BillingProviderSession>;
}

const manualProviderAdapter: BillingProviderAdapter = {
  provider: "manual",
  async createSession(input) {
    const reference = `MANUAL-${input.invoice.id}-${crypto.randomUUID()}`;

    return {
      providerReference: reference,
      paymentLink: null,
      linkExpiresAt: null,
      paymentMethodDetail: "Depósito bancario",
      initialStatus: "pending",
      instructions: {
        type: "manual_bank_deposit",
        reference,
        message:
          process.env.BILLING_MANUAL_PAYMENT_INSTRUCTIONS
          ?? "Realiza el depósito bancario y conserva el comprobante para validación manual.",
        bank_name: process.env.BILLING_MANUAL_BANK_NAME ?? null,
        account_name: process.env.BILLING_MANUAL_ACCOUNT_NAME ?? null,
        account_number: process.env.BILLING_MANUAL_ACCOUNT_NUMBER ?? null,
      },
      metadata: {
        adapter: "manual",
        idempotency_key: input.idempotencyKey,
      },
    };
  },
};

function notImplementedProviderAdapter(provider: BillingProvider): BillingProviderAdapter {
  return {
    provider,
    async createSession() {
      throw new BillingDomainError(
        `El proveedor "${provider}" aún no está implementado`,
        "PROVIDER_NOT_IMPLEMENTED",
      );
    },
  };
}

const PROVIDER_ADAPTERS: Record<BillingProvider, BillingProviderAdapter> = {
  manual: manualProviderAdapter,
  bac: notImplementedProviderAdapter("bac"),
  paypal: notImplementedProviderAdapter("paypal"),
};

export function getBillingProviderAdapter(provider: BillingProvider): BillingProviderAdapter {
  return PROVIDER_ADAPTERS[provider];
}
