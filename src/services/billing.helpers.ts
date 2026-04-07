import crypto from "crypto";
import { Op, QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../config/db";
import { BILLING_CONFIG } from "../config/billingConfig";
import SellerBillingPayment from "../models/SellerBillingPayment.model";
import SellerInvoice from "../models/SellerInvoice.model";
import SellerInvoiceItem from "../models/SellerInvoiceItem.model";
import SellerManualPaymentReport from "../models/SellerManualPaymentReport.model";
import SellerPlan from "../models/SellerPlan.model";
import SellerSubscription, { type BillingCycle } from "../models/SellerSubscription.model";
import { User } from "../models/user.model";
import type {
  ActivateSubscriptionInput,
  ApproveManualPaymentInput,
  BillingProviderSession,
  CreateSubscriptionInput,
  GeneratePaymentLinkInput,
  GenerateInvoiceInput,
  GenerateInvoiceReason,
  InvoiceIdentityScope,
  InvoiceItemDraft,
  ListManualPaymentReportsInput,
  MarkManualPaymentUnderReviewInput,
  RejectManualPaymentInput,
  ReportManualPaymentInput,
} from "./billing.types";
import { BillingDomainError, BillingValidationError } from "./billing.types";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateGenerateInvoiceInput(input: GenerateInvoiceInput): void {
  if (!Number.isInteger(input.sellerId) || input.sellerId <= 0) {
    throw new BillingValidationError("sellerId inválido", "INVALID_SELLER_ID");
  }
  if (!Number.isInteger(input.subscriptionId) || input.subscriptionId <= 0) {
    throw new BillingValidationError("subscriptionId inválido", "INVALID_SUBSCRIPTION_ID");
  }
  if (!["initial_subscription", "renewal"].includes(input.reason)) {
    throw new BillingValidationError("reason inválido", "INVALID_REASON");
  }
  if (input.actorRole !== undefined && typeof input.actorRole !== "string") {
    throw new BillingValidationError("actorRole inválido", "INVALID_ACTOR_ROLE");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
  if (input.metadata !== undefined && input.metadata !== null && !isPlainObject(input.metadata)) {
    throw new BillingValidationError("metadata inválida", "INVALID_METADATA");
  }
}

export function validateCreateSubscriptionInput(input: CreateSubscriptionInput): void {
  if (!Number.isInteger(input.sellerId) || input.sellerId <= 0) {
    throw new BillingValidationError("sellerId inválido", "INVALID_SELLER_ID");
  }
  if (!Number.isInteger(input.planId) || input.planId <= 0) {
    throw new BillingValidationError("planId inválido", "INVALID_PLAN_ID");
  }
  if (!["monthly", "yearly"].includes(input.billingCycle)) {
    throw new BillingValidationError("billingCycle inválido", "INVALID_BILLING_CYCLE");
  }
  if (input.autoRenew !== undefined && typeof input.autoRenew !== "boolean") {
    throw new BillingValidationError("autoRenew inválido", "INVALID_AUTO_RENEW");
  }
  if (input.actorRole !== undefined && typeof input.actorRole !== "string") {
    throw new BillingValidationError("actorRole inválido", "INVALID_ACTOR_ROLE");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
  if (input.metadata !== undefined && input.metadata !== null && !isPlainObject(input.metadata)) {
    throw new BillingValidationError("metadata inválida", "INVALID_METADATA");
  }
}

export function validateGeneratePaymentLinkInput(input: GeneratePaymentLinkInput): void {
  if (!Number.isInteger(input.invoiceId) || input.invoiceId <= 0) {
    throw new BillingValidationError("invoiceId inválido", "INVALID_INVOICE_ID");
  }
  if (!["manual", "bac", "paypal"].includes(input.provider)) {
    throw new BillingValidationError("provider inválido", "INVALID_PROVIDER");
  }
  if (input.actorRole !== undefined && typeof input.actorRole !== "string") {
    throw new BillingValidationError("actorRole inválido", "INVALID_ACTOR_ROLE");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
  if (input.metadata !== undefined && input.metadata !== null && !isPlainObject(input.metadata)) {
    throw new BillingValidationError("metadata inválida", "INVALID_METADATA");
  }
}

export function validateActivateSubscriptionInput(input: ActivateSubscriptionInput): void {
  if (!Number.isInteger(input.paymentId) || input.paymentId <= 0) {
    throw new BillingValidationError("paymentId inválido", "INVALID_PAYMENT_ID");
  }
  if (input.confirmedAt !== undefined && !(input.confirmedAt instanceof Date)) {
    throw new BillingValidationError("confirmedAt inválido", "INVALID_CONFIRMED_AT");
  }
  if (input.confirmedAt instanceof Date && Number.isNaN(input.confirmedAt.getTime())) {
    throw new BillingValidationError("confirmedAt inválido", "INVALID_CONFIRMED_AT");
  }
  if (
    input.confirmedBy !== undefined &&
    input.confirmedBy !== null &&
    (!Number.isInteger(input.confirmedBy) || input.confirmedBy <= 0)
  ) {
    throw new BillingValidationError("confirmedBy inválido", "INVALID_CONFIRMED_BY");
  }
  if (input.paymentMethodDetail !== undefined && input.paymentMethodDetail !== null && typeof input.paymentMethodDetail !== "string") {
    throw new BillingValidationError("paymentMethodDetail inválido", "INVALID_PAYMENT_METHOD_DETAIL");
  }
  if (input.providerReference !== undefined && input.providerReference !== null && typeof input.providerReference !== "string") {
    throw new BillingValidationError("providerReference inválido", "INVALID_PROVIDER_REFERENCE");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
  if (input.actorRole !== undefined && typeof input.actorRole !== "string") {
    throw new BillingValidationError("actorRole inválido", "INVALID_ACTOR_ROLE");
  }
  if (input.metadata !== undefined && input.metadata !== null && !isPlainObject(input.metadata)) {
    throw new BillingValidationError("metadata inválida", "INVALID_METADATA");
  }
}

export function validateReportManualPaymentInput(input: ReportManualPaymentInput): void {
  if (!Number.isInteger(input.sellerId) || input.sellerId <= 0) {
    throw new BillingValidationError("sellerId inválido", "INVALID_SELLER_ID");
  }
  if (!Number.isInteger(input.paymentId) || input.paymentId <= 0) {
    throw new BillingValidationError("paymentId inválido", "INVALID_PAYMENT_ID");
  }
  if (!input.bankName?.trim()) {
    throw new BillingValidationError("bankName requerido", "INVALID_BANK_NAME");
  }
  if (!input.depositReference?.trim()) {
    throw new BillingValidationError("depositReference requerido", "INVALID_DEPOSIT_REFERENCE");
  }
  if (!input.depositorName?.trim()) {
    throw new BillingValidationError("depositorName requerido", "INVALID_DEPOSITOR_NAME");
  }
  parseDateOnlyToUtc(input.depositDate);
  if (!Number.isFinite(input.reportedAmount) || input.reportedAmount <= 0) {
    throw new BillingValidationError("reportedAmount inválido", "INVALID_REPORTED_AMOUNT");
  }
  if (typeof input.currency !== "string" || input.currency.trim().length !== 3) {
    throw new BillingValidationError("currency inválida", "INVALID_CURRENCY");
  }
  if (input.receiptFileUrl !== undefined && input.receiptFileUrl !== null && typeof input.receiptFileUrl !== "string") {
    throw new BillingValidationError("receiptFileUrl inválido", "INVALID_RECEIPT_FILE_URL");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
  if (input.actorRole !== undefined && typeof input.actorRole !== "string") {
    throw new BillingValidationError("actorRole inválido", "INVALID_ACTOR_ROLE");
  }
  if (input.metadata !== undefined && input.metadata !== null && !isPlainObject(input.metadata)) {
    throw new BillingValidationError("metadata inválida", "INVALID_METADATA");
  }
}

export async function lockSellerForSubscriptionFlow(params: {
  sellerId: number;
  transaction: Transaction;
}): Promise<User> {
  const seller = await User.findByPk(params.sellerId, {
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!seller) {
    throw new BillingDomainError("Vendedor no encontrado", "SELLER_NOT_FOUND");
  }

  return seller;
}

export async function loadPlanForSubscriptionCreation(params: {
  planId: number;
  billingCycle: BillingCycle;
  transaction: Transaction;
}): Promise<SellerPlan> {
  const plan = await SellerPlan.findByPk(params.planId, {
    transaction: params.transaction,
  });

  if (!plan) {
    throw new BillingDomainError("Plan no encontrado", "PLAN_NOT_FOUND");
  }
  if (!plan.is_active) {
    throw new BillingDomainError("El plan no está activo", "PLAN_NOT_ACTIVE");
  }

  const selectedPrice =
    params.billingCycle === "yearly"
      ? plan.price_yearly
      : plan.price_monthly;

  if (selectedPrice === null || selectedPrice === undefined) {
    throw new BillingDomainError(
      `El plan no tiene precio para el ciclo ${params.billingCycle}`,
      "PLAN_PRICE_NOT_AVAILABLE",
    );
  }

  normalizeMoney(selectedPrice);
  return plan;
}

export async function lockSellerSubscriptions(params: {
  sellerId: number;
  transaction: Transaction;
}): Promise<SellerSubscription[]> {
  return SellerSubscription.findAll({
    where: { seller_id: params.sellerId },
    order: [["created_at", "DESC"]],
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });
}

export function selectSubscriptionPrice(params: {
  plan: SellerPlan;
  billingCycle: BillingCycle;
}): number {
  const rawPrice =
    params.billingCycle === "yearly"
      ? params.plan.price_yearly
      : params.plan.price_monthly;

  if (rawPrice === null || rawPrice === undefined) {
    throw new BillingDomainError(
      `El plan no tiene precio para el ciclo ${params.billingCycle}`,
      "PLAN_PRICE_NOT_AVAILABLE",
    );
  }

  return roundMoney(normalizeMoney(rawPrice));
}

export function findReusableDraftSubscription(params: {
  subscriptions: SellerSubscription[];
  planId: number;
  billingCycle: BillingCycle;
}): SellerSubscription | null {
  return params.subscriptions.find((subscription) =>
    subscription.status === "draft" &&
    subscription.plan_id === params.planId &&
    subscription.billing_cycle === params.billingCycle,
  ) ?? null;
}

export async function loadInvoicePayments(params: {
  invoiceId: number;
  transaction: Transaction;
}): Promise<SellerBillingPayment[]> {
  return SellerBillingPayment.findAll({
    where: { invoice_id: params.invoiceId },
    order: [["created_at", "DESC"]],
    transaction: params.transaction,
  });
}

export function isPaymentLinkExpired(
  payment: SellerBillingPayment,
  now: Date,
): boolean {
  return (
    payment.status === "pending" &&
    payment.provider_link_expires_at !== null &&
    payment.provider_link_expires_at.getTime() <= now.getTime()
  );
}

export async function expireStalePaymentAttempts(params: {
  payments: SellerBillingPayment[];
  now: Date;
  transaction: Transaction;
}): Promise<void> {
  const staleIds = params.payments
    .filter((payment) => isPaymentLinkExpired(payment, params.now))
    .map((payment) => payment.id);

  if (staleIds.length === 0) return;

  await SellerBillingPayment.update(
    {
      status: "expired",
      failure_reason: "Payment link expired before reuse",
    },
    {
      where: { id: { [Op.in]: staleIds } },
      transaction: params.transaction,
    },
  );
}

export function findReusablePaymentAttempt(params: {
  payments: SellerBillingPayment[];
  provider: GeneratePaymentLinkInput["provider"];
  now: Date;
}): SellerBillingPayment | null {
  for (const payment of params.payments) {
    if (payment.provider !== params.provider) continue;
    if (payment.status === "confirmed") continue;
    if (isPaymentLinkExpired(payment, params.now)) continue;

    if (payment.status === "pending") return payment;
    if (payment.status === "processing") return payment;
    if (payment.status === "manual_pending") return payment;
  }

  return null;
}

export function assertNoConfirmedPaymentAttempt(payments: SellerBillingPayment[]): void {
  const confirmed = payments.find((payment) => payment.status === "confirmed");
  if (!confirmed) return;

  throw new BillingDomainError(
    `La factura ya tiene un pago confirmado (${confirmed.id})`,
    "INVOICE_HAS_CONFIRMED_PAYMENT",
  );
}

export function generatePaymentAttemptIdempotencyKey(params: {
  invoiceId: number;
  provider: GeneratePaymentLinkInput["provider"];
}): string {
  return `billing:${params.provider}:invoice:${params.invoiceId}:${crypto.randomUUID()}`;
}

export function assertNoConflictingSubscriptionFlow(params: {
  subscriptions: SellerSubscription[];
  planId: number;
  billingCycle: BillingCycle;
}): void {
  const activeLike = params.subscriptions.find((subscription) =>
    ["active", "past_due", "paused"].includes(subscription.status),
  );

  if (activeLike) {
    throw new BillingDomainError(
      `Ya existe una suscripción en estado "${activeLike.status}" para este vendedor`,
      "ACTIVE_SUBSCRIPTION_FLOW_EXISTS",
    );
  }

  const conflictingDraft = params.subscriptions.find((subscription) =>
    subscription.status === "draft" &&
    (subscription.plan_id !== params.planId || subscription.billing_cycle !== params.billingCycle),
  );

  if (conflictingDraft) {
    throw new BillingDomainError(
      "Ya existe un flujo de suscripción pendiente para otro plan o ciclo",
      "DRAFT_SUBSCRIPTION_CONFLICT",
    );
  }
}

export function buildSubscriptionMetadata(params: {
  input: CreateSubscriptionInput;
  plan: SellerPlan;
  priceAtSignup: number;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    source: "createSubscription",
    plan_snapshot: {
      plan_id: params.plan.id,
      slug: params.plan.slug,
      name: params.plan.name,
      currency: params.plan.currency,
      billing_cycle: params.input.billingCycle,
      price_at_signup: params.priceAtSignup,
    },
  };

  if (params.input.actorUserId !== undefined) {
    metadata.actor_user_id = params.input.actorUserId;
  }
  if (params.input.actorRole) {
    metadata.actor_role = params.input.actorRole;
  }
  if (params.input.metadata) {
    metadata.client_metadata = params.input.metadata;
  }

  return metadata;
}

export function buildPaymentMetadata(params: {
  input: GeneratePaymentLinkInput;
  idempotencyKey: string;
  providerSession: BillingProviderSession;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    source: "generatePaymentLink",
    idempotency_key: params.idempotencyKey,
    provider_session: params.providerSession.metadata ?? null,
    instructions: params.providerSession.instructions,
  };

  if (params.input.actorUserId !== undefined) {
    metadata.actor_user_id = params.input.actorUserId;
  }
  if (params.input.actorRole) {
    metadata.actor_role = params.input.actorRole;
  }
  if (params.input.metadata) {
    metadata.client_metadata = params.input.metadata;
  }

  return metadata;
}

export function buildActivationMetadata(params: {
  input: ActivateSubscriptionInput;
  previousMetadata: object | null;
  paymentId: number;
  periodStart: string;
  periodEnd: string;
}): Record<string, unknown> {
  const metadata =
    params.previousMetadata !== null && isPlainObject(params.previousMetadata)
      ? { ...params.previousMetadata }
      : {};

  metadata.last_activation = {
    payment_id: params.paymentId,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    confirmed_at: (params.input.confirmedAt ?? nowUtcDate()).toISOString(),
    actor_user_id: params.input.actorUserId ?? null,
    actor_role: params.input.actorRole ?? null,
  };

  if (params.input.metadata) {
    metadata.last_activation_input = params.input.metadata;
  }

  return metadata;
}

export function buildManualPaymentReportMetadata(params: {
  input: ReportManualPaymentInput;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    source: "reportManualPayment",
  };

  if (params.input.actorUserId !== undefined) {
    metadata.actor_user_id = params.input.actorUserId;
  }
  if (params.input.actorRole) {
    metadata.actor_role = params.input.actorRole;
  }
  if (params.input.metadata) {
    metadata.client_metadata = params.input.metadata;
  }

  return metadata;
}

export async function lockSubscriptionForInvoicing(params: {
  sellerId: number;
  subscriptionId: number;
  transaction: Transaction;
}): Promise<SellerSubscription> {
  const subscription = await SellerSubscription.findOne({
    where: {
      id: params.subscriptionId,
      seller_id: params.sellerId,
    },
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!subscription) {
    throw new BillingDomainError("Suscripción no encontrada", "SUBSCRIPTION_NOT_FOUND");
  }

  return subscription;
}

export async function lockInvoiceForPaymentLink(params: {
  invoiceId: number;
  transaction: Transaction;
}): Promise<SellerInvoice> {
  const invoice = await SellerInvoice.findByPk(params.invoiceId, {
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!invoice) {
    throw new BillingDomainError("Factura no encontrada", "INVOICE_NOT_FOUND");
  }

  return invoice;
}

export async function lockPaymentForActivation(params: {
  paymentId: number;
  transaction: Transaction;
}): Promise<SellerBillingPayment> {
  const payment = await SellerBillingPayment.findByPk(params.paymentId, {
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!payment) {
    throw new BillingDomainError("Pago no encontrado", "PAYMENT_NOT_FOUND");
  }

  return payment;
}

export async function lockInvoiceForActivation(params: {
  invoiceId: number;
  transaction: Transaction;
}): Promise<SellerInvoice> {
  const invoice = await SellerInvoice.findByPk(params.invoiceId, {
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!invoice) {
    throw new BillingDomainError("Factura no encontrada", "INVOICE_NOT_FOUND");
  }

  return invoice;
}

export async function lockSubscriptionForActivation(params: {
  subscriptionId: number;
  transaction: Transaction;
}): Promise<SellerSubscription> {
  const subscription = await SellerSubscription.findByPk(params.subscriptionId, {
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!subscription) {
    throw new BillingDomainError("Suscripción no encontrada", "SUBSCRIPTION_NOT_FOUND");
  }

  return subscription;
}

export async function findManualPaymentReportByPaymentId(params: {
  paymentId: number;
  transaction: Transaction;
}): Promise<SellerManualPaymentReport | null> {
  return SellerManualPaymentReport.findOne({
    where: { payment_id: params.paymentId },
    transaction: params.transaction,
  });
}

export function assertSubscriptionInvoiceable(
  subscription: SellerSubscription,
  reason: GenerateInvoiceReason,
): void {
  const allowedStatuses: SellerSubscription["status"][] =
    reason === "initial_subscription"
      ? ["draft"]
      : ["active", "past_due", "expired"];

  if (!allowedStatuses.includes(subscription.status)) {
    throw new BillingDomainError(
      `La suscripción en estado "${subscription.status}" no permite generar factura para "${reason}"`,
      "SUBSCRIPTION_NOT_INVOICEABLE",
    );
  }

  if (reason === "renewal" && !subscription.current_period_end) {
    throw new BillingDomainError(
      "La suscripción no tiene current_period_end para generar renovación",
      "MISSING_CURRENT_PERIOD_END",
    );
  }
}

export function assertInvoiceCanGeneratePaymentLink(invoice: SellerInvoice): void {
  if (invoice.status !== "open") {
    throw new BillingDomainError(
      `La factura en estado "${invoice.status}" no permite generar un intento de pago`,
      "INVOICE_NOT_PAYABLE",
    );
  }

  if (invoice.paid_at) {
    throw new BillingDomainError("La factura ya fue pagada", "INVOICE_ALREADY_PAID");
  }
}

export function assertActivationConsistency(params: {
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  subscription: SellerSubscription;
}): void {
  if (params.payment.invoice_id !== params.invoice.id) {
    throw new BillingDomainError("El pago no pertenece a la factura indicada", "PAYMENT_INVOICE_MISMATCH");
  }
  if (params.invoice.subscription_id === null) {
    throw new BillingDomainError("La factura no está vinculada a una suscripción", "INVOICE_HAS_NO_SUBSCRIPTION");
  }
  if (params.invoice.subscription_id !== params.subscription.id) {
    throw new BillingDomainError("La factura no pertenece a la suscripción indicada", "INVOICE_SUBSCRIPTION_MISMATCH");
  }
  if (params.payment.seller_id !== params.invoice.seller_id) {
    throw new BillingDomainError("El pago no pertenece al vendedor de la factura", "PAYMENT_SELLER_MISMATCH");
  }
  if (params.subscription.seller_id !== params.invoice.seller_id) {
    throw new BillingDomainError("La suscripción no pertenece al vendedor de la factura", "SUBSCRIPTION_SELLER_MISMATCH");
  }

  const paymentAmount = roundMoney(normalizeMoney(params.payment.amount));
  const invoiceAmount = roundMoney(normalizeMoney(params.invoice.total_amount));
  if (paymentAmount !== invoiceAmount) {
    throw new BillingDomainError("El monto del pago no coincide con la factura", "PAYMENT_AMOUNT_MISMATCH");
  }
  if (params.payment.currency !== params.invoice.currency) {
    throw new BillingDomainError("La moneda del pago no coincide con la factura", "PAYMENT_CURRENCY_MISMATCH");
  }
}

export function assertSubscriptionCanBeActivated(subscription: SellerSubscription): void {
  if (subscription.status === "paused") {
    throw new BillingDomainError("Las suscripciones pausadas no se activan automáticamente", "SUBSCRIPTION_PAUSED");
  }
  if (subscription.status === "cancelled") {
    throw new BillingDomainError("Las suscripciones canceladas no se reactivan automáticamente", "SUBSCRIPTION_CANCELLED");
  }
  if (!["draft", "active", "past_due", "expired"].includes(subscription.status)) {
    throw new BillingDomainError(
      `La suscripción en estado "${subscription.status}" no puede activarse`,
      "SUBSCRIPTION_NOT_ACTIVATABLE",
    );
  }
}

export function assertSettlementStatuses(params: {
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  subscription: SellerSubscription;
}): void {
  if (!["pending", "processing", "manual_pending", "confirmed"].includes(params.payment.status)) {
    throw new BillingDomainError(
      `El pago en estado "${params.payment.status}" no puede confirmarse`,
      "PAYMENT_NOT_CONFIRMABLE",
    );
  }

  if (!["open", "paid"].includes(params.invoice.status)) {
    throw new BillingDomainError(
      `La factura en estado "${params.invoice.status}" no puede liquidarse`,
      "INVOICE_NOT_SETTLEABLE",
    );
  }

  if (params.subscription.last_payment_id === params.payment.id) {
    return;
  }

  if (params.payment.status === "confirmed") {
    throw new BillingDomainError(
      "El pago ya está confirmado pero no está ligado a la suscripción como último pago",
      "PAYMENT_ALREADY_CONFIRMED_INCONSISTENT",
    );
  }
  if (params.invoice.status === "paid") {
    throw new BillingDomainError(
      "La factura ya está pagada pero no está ligada a este pago en la suscripción",
      "INVOICE_ALREADY_PAID_INCONSISTENT",
    );
  }
}

export function assertManualPaymentReportEligibility(params: {
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  sellerId: number;
  reportedAmount: number;
  currency: string;
}): void {
  if (params.payment.seller_id !== params.sellerId) {
    throw new BillingDomainError("El pago no pertenece al vendedor autenticado", "PAYMENT_SELLER_MISMATCH");
  }
  if (params.payment.invoice_id !== params.invoice.id) {
    throw new BillingDomainError("El pago no pertenece a la factura indicada", "PAYMENT_INVOICE_MISMATCH");
  }
  if (params.invoice.seller_id !== params.sellerId) {
    throw new BillingDomainError("La factura no pertenece al vendedor autenticado", "INVOICE_SELLER_MISMATCH");
  }
  if (params.payment.provider !== "manual") {
    throw new BillingDomainError("Solo los pagos manuales admiten reportes del vendedor", "PAYMENT_PROVIDER_NOT_MANUAL");
  }
  if (params.invoice.status !== "open" || params.invoice.paid_at !== null) {
    throw new BillingDomainError("La factura ya no está abierta para reporte manual", "INVOICE_NOT_OPEN");
  }
  if (params.payment.status === "confirmed") {
    throw new BillingDomainError("El pago ya fue confirmado", "PAYMENT_ALREADY_CONFIRMED");
  }
  if (!["pending", "manual_pending"].includes(params.payment.status)) {
    throw new BillingDomainError(
      `El pago en estado "${params.payment.status}" no admite reporte manual`,
      "PAYMENT_NOT_REPORTABLE",
    );
  }

  const invoiceAmount = roundMoney(normalizeMoney(params.invoice.total_amount));
  const reportedAmount = roundMoney(normalizeMoney(params.reportedAmount));
  if (reportedAmount <= 0) {
    throw new BillingDomainError("El monto reportado debe ser mayor que cero", "REPORTED_AMOUNT_INVALID");
  }
  if (reportedAmount !== invoiceAmount) {
    throw new BillingDomainError("El monto reportado no coincide con la factura", "REPORTED_AMOUNT_MISMATCH");
  }

  const normalizedCurrency = params.currency.trim().toUpperCase();
  if (normalizedCurrency !== params.invoice.currency) {
    throw new BillingDomainError("La moneda reportada no coincide con la factura", "REPORTED_CURRENCY_MISMATCH");
  }
}

export function deriveActivationPeriod(subscription: SellerSubscription): {
  periodStart: string;
  periodEnd: string;
} {
  const cycleDays = getCyclePeriodDays(subscription.billing_cycle);

  if (subscription.status === "draft" || subscription.status === "expired") {
    const periodStart = getTodayDateOnly();
    const periodEnd = addDaysToDateOnly(periodStart, cycleDays - 1);
    return { periodStart, periodEnd };
  }

  if (!subscription.current_period_end) {
    throw new BillingDomainError(
      "La suscripción no tiene current_period_end para extender el período",
      "MISSING_CURRENT_PERIOD_END",
    );
  }

  const periodStart = addDaysToDateOnly(subscription.current_period_end, 1);
  const periodEnd = addDaysToDateOnly(periodStart, cycleDays - 1);
  return { periodStart, periodEnd };
}

export function getCyclePeriodDays(cycle: BillingCycle): number {
  if (cycle === "monthly") return BILLING_CONFIG.PERIOD_DAYS_MONTHLY;
  if (cycle === "yearly") return BILLING_CONFIG.PERIOD_DAYS_YEARLY;

  throw new BillingDomainError(`billing_cycle no soportado: ${cycle}`, "INVALID_BILLING_CYCLE");
}

export function parseDateOnlyToUtc(dateOnly: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) {
    throw new BillingDomainError(`DATEONLY inválido: ${dateOnly}`, "INVALID_DATEONLY");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    throw new BillingDomainError(`DATEONLY inválido: ${dateOnly}`, "INVALID_DATEONLY");
  }

  return date;
}

export function formatUtcDateAsDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const date = parseDateOnlyToUtc(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDateAsDateOnly(date);
}

export function getTodayDateOnly(): string {
  return formatUtcDateAsDateOnly(new Date());
}

export function deriveInvoiceCoveragePeriod(
  subscription: SellerSubscription,
  reason: GenerateInvoiceReason,
): { periodStart: string; periodEnd: string } {
  const cycleDays = getCyclePeriodDays(subscription.billing_cycle);

  if (reason === "initial_subscription") {
    if (subscription.current_period_start || subscription.current_period_end) {
      throw new BillingDomainError(
        "La suscripción ya tiene un período activo; no corresponde factura inicial",
        "INITIAL_PERIOD_ALREADY_EXISTS",
      );
    }

    const periodStart = getTodayDateOnly();
    const periodEnd = addDaysToDateOnly(periodStart, cycleDays - 1);
    return { periodStart, periodEnd };
  }

  const periodStart = addDaysToDateOnly(subscription.current_period_end!, 1);
  const periodEnd = addDaysToDateOnly(periodStart, cycleDays - 1);
  return { periodStart, periodEnd };
}

export function normalizeMoney(value: string | number): number {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) {
    throw new BillingDomainError("Valor monetario inválido", "INVALID_MONEY_VALUE");
  }
  return amount;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function nowUtcDate(): Date {
  return new Date();
}

export function computeTaxAmount(subtotal: number): number {
  return roundMoney(subtotal * BILLING_CONFIG.TAX_RATE);
}

export function computeInvoiceTotals(items: InvoiceItemDraft[]): {
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const subtotalAmount = roundMoney(
    items.reduce((sum, item) => sum + normalizeMoney(item.totalAmount), 0),
  );
  const taxAmount = computeTaxAmount(subtotalAmount);
  const totalAmount = roundMoney(subtotalAmount + taxAmount);

  return { subtotalAmount, taxAmount, totalAmount };
}

export async function loadPlanName(
  subscription: SellerSubscription,
  transaction: Transaction,
): Promise<string | null> {
  const plan = await SellerPlan.findByPk(subscription.plan_id, {
    transaction,
    attributes: ["name"],
  });

  return plan?.name ?? null;
}

export function buildInvoiceDescription(params: {
  planName: string | null;
  billingCycle: BillingCycle;
  reason: GenerateInvoiceReason;
  periodStart: string;
  periodEnd: string;
}): string {
  const cycleLabel = params.billingCycle === "yearly" ? "anual" : "mensual";
  const prefix = params.reason === "renewal" ? "Renovación" : "Suscripción inicial";
  const planLabel = params.planName ? ` Plan ${params.planName}` : "";
  return `${prefix}${planLabel} (${cycleLabel}) del ${params.periodStart} al ${params.periodEnd}`;
}

export function buildSubscriptionInvoiceItems(params: {
  subscription: SellerSubscription;
  planName: string | null;
  reason: GenerateInvoiceReason;
  periodStart: string;
  periodEnd: string;
}): InvoiceItemDraft[] {
  const unitAmount = roundMoney(normalizeMoney(params.subscription.price_at_signup));
  const quantity = 1;

  return [
    {
      description: buildInvoiceDescription({
        planName: params.planName,
        billingCycle: params.subscription.billing_cycle,
        reason: params.reason,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      }),
      quantity,
      unitAmount,
      totalAmount: roundMoney(unitAmount * quantity),
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      featureKey: null,
      metadata: {
        reason: params.reason,
        billing_cycle: params.subscription.billing_cycle,
        plan_id: params.subscription.plan_id,
      },
    },
  ];
}

function normalizeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (isPlainObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = normalizeJsonValue(value[key]);
    }
    return result;
  }

  return String(value);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

export function buildInvoiceIdentityScope(params: {
  sellerId: number;
  subscriptionId: number;
  reason: GenerateInvoiceReason;
  billingCycle: BillingCycle;
  currency: string;
  priceAtSignup: number;
  periodStart: string;
  periodEnd: string;
}): InvoiceIdentityScope {
  return {
    type: "subscription",
    sellerId: params.sellerId,
    subscriptionId: params.subscriptionId,
    reason: params.reason,
    billingCycle: params.billingCycle,
    currency: params.currency,
    priceAtSignup: roundMoney(params.priceAtSignup),
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  };
}

export function hashInvoiceIdentityScope(scope: InvoiceIdentityScope): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(scope))
    .digest("hex");
}

function extractMetadataObject(metadata: object | null): Record<string, unknown> | null {
  return isPlainObject(metadata) ? metadata : null;
}

export async function findExistingInvoiceByScope(params: {
  sellerId: number;
  subscriptionId: number;
  idempotencyHash: string;
  transaction: Transaction;
}): Promise<{ invoice: SellerInvoice; items: SellerInvoiceItem[] } | null> {
  const candidates = await SellerInvoice.findAll({
    where: {
      seller_id: params.sellerId,
      subscription_id: params.subscriptionId,
      type: "subscription",
      status: { [Op.in]: ["draft", "open", "paid"] },
    },
    order: [["created_at", "DESC"]],
    transaction: params.transaction,
  });

  for (const invoice of candidates) {
    const metadata = extractMetadataObject(invoice.metadata);
    if (metadata?.idempotency_hash !== params.idempotencyHash) continue;

    const items = await SellerInvoiceItem.findAll({
      where: { invoice_id: invoice.id },
      order: [["id", "ASC"]],
      transaction: params.transaction,
    });

    return { invoice, items };
  }

  return null;
}

export async function allocateInvoiceNumber(transaction: Transaction): Promise<string> {
  const rows = await sequelize.query<{ seq: string | number }>(
    "SELECT nextval('seller_invoice_number_seq')::bigint AS seq",
    {
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  const row = rows[0];
  if (!row) {
    throw new BillingDomainError("No se pudo obtener la secuencia de factura", "INVOICE_SEQUENCE_FAILED");
  }

  const seq = normalizeMoney(row.seq);
  const year = new Date().getUTCFullYear();
  return `FLW-${year}-${String(Math.trunc(seq)).padStart(5, "0")}`;
}

export function buildInvoiceMetadata(params: {
  input: GenerateInvoiceInput;
  subscription: SellerSubscription;
  periodStart: string;
  periodEnd: string;
  idempotencyScope: InvoiceIdentityScope;
  idempotencyHash: string;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    reason: params.input.reason,
    billing_cycle: params.subscription.billing_cycle,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    idempotency_scope: params.idempotencyScope,
    idempotency_hash: params.idempotencyHash,
    price_snapshot: {
      amount: roundMoney(normalizeMoney(params.subscription.price_at_signup)),
      currency: params.subscription.currency_at_signup,
    },
  };

  if (params.input.actorUserId !== undefined) {
    metadata.actor_user_id = params.input.actorUserId;
  }
  if (params.input.actorRole) {
    metadata.actor_role = params.input.actorRole;
  }
  if (params.input.metadata) {
    metadata.client_metadata = params.input.metadata;
  }

  return metadata;
}

export function deriveInvoiceDueDate(): string {
  return addDaysToDateOnly(getTodayDateOnly(), BILLING_CONFIG.INVOICE_DUE_DAYS);
}

// ─── Renewal Cron helpers ─────────────────────────────────────────────────────

/**
 * Returns active subscriptions whose renewal invoice should be generated now.
 *
 * Criteria:
 *   status = 'active'
 *   auto_renew = true
 *   current_period_end <= CURRENT_DATE + RENEWAL_NOTICE_DAYS
 *
 * All date comparisons happen in SQL to avoid JavaScript timezone drift.
 * LIMIT prevents a single cron run from exhausting the connection pool.
 */
export async function findSubscriptionsDueForRenewalInvoice(params: {
  batchSize: number;
}): Promise<SellerSubscription[]> {
  return SellerSubscription.findAll({
    where: sequelize.literal(
      `status = 'active'
       AND auto_renew = true
       AND current_period_end IS NOT NULL
       AND current_period_end <= CURRENT_DATE + INTERVAL '${BILLING_CONFIG.RENEWAL_NOTICE_DAYS} days'`,
    ) as any,
    order: [["current_period_end", "ASC"]],
    limit: params.batchSize,
  });
}

/**
 * Returns subscriptions that should be transitioned to past_due.
 *
 * Criteria:
 *   status = 'active'
 *   auto_renew = true
 *   current_period_end < CURRENT_DATE  (period has ended)
 */
export async function findActiveSubscriptionsOverdue(params: {
  batchSize: number;
}): Promise<SellerSubscription[]> {
  return SellerSubscription.findAll({
    where: sequelize.literal(
      `status = 'active'
       AND auto_renew = true
       AND current_period_end IS NOT NULL
       AND current_period_end < CURRENT_DATE`,
    ) as any,
    order: [["current_period_end", "ASC"]],
    limit: params.batchSize,
  });
}

/**
 * Returns subscriptions that should be transitioned to expired.
 *
 * Criteria (two cases combined with UNION logic via two queries):
 *   1. status = 'active', auto_renew = false, current_period_end < CURRENT_DATE
 *   2. status = 'past_due', grace_period_end < CURRENT_DATE
 *
 * Run as separate queries so the caller can reason about each case.
 */
export async function findActiveNoRenewSubscriptionsExpired(params: {
  batchSize: number;
}): Promise<SellerSubscription[]> {
  return SellerSubscription.findAll({
    where: sequelize.literal(
      `status = 'active'
       AND auto_renew = false
       AND current_period_end IS NOT NULL
       AND current_period_end < CURRENT_DATE`,
    ) as any,
    order: [["current_period_end", "ASC"]],
    limit: params.batchSize,
  });
}

export async function findPastDueSubscriptionsExpired(params: {
  batchSize: number;
}): Promise<SellerSubscription[]> {
  return SellerSubscription.findAll({
    where: sequelize.literal(
      `status = 'past_due'
       AND grace_period_end IS NOT NULL
       AND grace_period_end < CURRENT_DATE`,
    ) as any,
    order: [["grace_period_end", "ASC"]],
    limit: params.batchSize,
  });
}

/**
 * Checks whether a subscription has any non-terminal payment attempt
 * (pending / processing / manual_pending) that might settle before expiry.
 * If so, the cron skips transitioning to past_due/expired — let the payment resolve first.
 */
export async function subscriptionHasActivePaymentAttempt(
  subscription: SellerSubscription,
): Promise<boolean> {
  const count = await SellerBillingPayment.count({
    where: sequelize.literal(
      `seller_id = ${subscription.seller_id}
       AND status IN ('pending', 'processing', 'manual_pending')`,
    ) as any,
  });
  return count > 0;
}

/**
 * Derives the grace_period_end for a subscription that is being moved to past_due.
 * Grace period = today + GRACE_PERIOD_DAYS (not from current_period_end, to give
 * the seller a full grace window regardless of how late the cron ran).
 */
export function deriveGracePeriodEnd(): string {
  return addDaysToDateOnly(getTodayDateOnly(), BILLING_CONFIG.GRACE_PERIOD_DAYS);
}

// ─── Phase 3: Manual Payment Admin Review ────────────────────────────────────

// Input validators

export function validateMarkManualPaymentUnderReviewInput(
  input: MarkManualPaymentUnderReviewInput,
): void {
  if (!Number.isInteger(input.reportId) || input.reportId <= 0) {
    throw new BillingValidationError("reportId inválido", "INVALID_REPORT_ID");
  }
  if (!Number.isInteger(input.adminId) || input.adminId <= 0) {
    throw new BillingValidationError("adminId inválido", "INVALID_ADMIN_ID");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
}

export function validateApproveManualPaymentInput(
  input: ApproveManualPaymentInput,
): void {
  if (!Number.isInteger(input.reportId) || input.reportId <= 0) {
    throw new BillingValidationError("reportId inválido", "INVALID_REPORT_ID");
  }
  if (!Number.isInteger(input.adminId) || input.adminId <= 0) {
    throw new BillingValidationError("adminId inválido", "INVALID_ADMIN_ID");
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
}

export function validateRejectManualPaymentInput(
  input: RejectManualPaymentInput,
): void {
  if (!Number.isInteger(input.reportId) || input.reportId <= 0) {
    throw new BillingValidationError("reportId inválido", "INVALID_REPORT_ID");
  }
  if (!Number.isInteger(input.adminId) || input.adminId <= 0) {
    throw new BillingValidationError("adminId inválido", "INVALID_ADMIN_ID");
  }
  if (!input.rejectionReason?.trim()) {
    throw new BillingValidationError(
      "rejectionReason es requerido",
      "MISSING_REJECTION_REASON",
    );
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new BillingValidationError("notes inválido", "INVALID_NOTES");
  }
}

// Row locking helpers (lock order: report → payment → invoice → subscription)

export async function lockReportForReview(params: {
  reportId: number;
  transaction: Transaction;
}): Promise<SellerManualPaymentReport> {
  const report = await SellerManualPaymentReport.findByPk(params.reportId, {
    transaction: params.transaction,
    lock: params.transaction.LOCK.UPDATE,
  });

  if (!report) {
    throw new BillingDomainError("Reporte de pago no encontrado", "REPORT_NOT_FOUND");
  }

  return report;
}

// State-machine guards

export function assertReportCanBeMarkedUnderReview(
  report: SellerManualPaymentReport,
): void {
  if (report.status === "under_review") return; // idempotent

  if (report.status === "approved") {
    throw new BillingDomainError(
      "El reporte ya fue aprobado",
      "REPORT_ALREADY_APPROVED",
    );
  }
  if (report.status === "rejected") {
    throw new BillingDomainError(
      "El reporte ya fue rechazado",
      "REPORT_ALREADY_REJECTED",
    );
  }
  if (report.status !== "submitted") {
    throw new BillingDomainError(
      `El reporte en estado "${report.status}" no permite cambio a under_review`,
      "REPORT_INVALID_STATE_TRANSITION",
    );
  }
}

export function assertReportCanBeApproved(
  report: SellerManualPaymentReport,
): void {
  if (report.status === "approved") return; // idempotent — caller checks last_payment_id anchor

  if (report.status === "rejected") {
    throw new BillingDomainError(
      "El reporte ya fue rechazado y no puede aprobarse",
      "REPORT_ALREADY_REJECTED",
    );
  }
  if (!["submitted", "under_review"].includes(report.status)) {
    throw new BillingDomainError(
      `El reporte en estado "${report.status}" no puede aprobarse`,
      "REPORT_NOT_APPROVABLE",
    );
  }
}

export function assertReportCanBeRejected(
  report: SellerManualPaymentReport,
): void {
  if (report.status === "rejected") return; // idempotent — caller checks payment.status anchor

  if (report.status === "approved") {
    throw new BillingDomainError(
      "El reporte ya fue aprobado y no puede rechazarse",
      "REPORT_ALREADY_APPROVED",
    );
  }
  if (!["submitted", "under_review"].includes(report.status)) {
    throw new BillingDomainError(
      `El reporte en estado "${report.status}" no puede rechazarse`,
      "REPORT_NOT_REJECTABLE",
    );
  }
}

// Cross-entity consistency checks for approval

export function assertApprovalConsistency(params: {
  report: SellerManualPaymentReport;
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
}): void {
  if (params.report.payment_id !== params.payment.id) {
    throw new BillingDomainError(
      "El reporte no pertenece al pago indicado",
      "REPORT_PAYMENT_MISMATCH",
    );
  }
  if (params.report.invoice_id !== params.invoice.id) {
    throw new BillingDomainError(
      "El reporte no pertenece a la factura indicada",
      "REPORT_INVOICE_MISMATCH",
    );
  }
  if (params.payment.invoice_id !== params.invoice.id) {
    throw new BillingDomainError(
      "El pago no pertenece a la factura indicada",
      "PAYMENT_INVOICE_MISMATCH",
    );
  }
  if (params.report.seller_id !== params.payment.seller_id) {
    throw new BillingDomainError(
      "El reporte y el pago pertenecen a vendedores distintos",
      "REPORT_SELLER_MISMATCH",
    );
  }
  if (params.payment.provider !== "manual") {
    throw new BillingDomainError(
      "Solo los pagos con provider=manual pueden aprobarse por esta ruta",
      "PAYMENT_PROVIDER_NOT_MANUAL",
    );
  }
}

export function assertPaymentStillManualPending(
  payment: SellerBillingPayment,
): void {
  if (payment.status === "confirmed") {
    // This branch is only reachable if another admin already approved.
    // The caller must re-check the subscription's last_payment_id anchor.
    throw new BillingDomainError(
      "El pago ya fue confirmado",
      "PAYMENT_ALREADY_CONFIRMED",
    );
  }
  if (payment.status !== "manual_pending") {
    throw new BillingDomainError(
      `El pago en estado "${payment.status}" no puede aprobarse manualmente`,
      "PAYMENT_NOT_MANUAL_PENDING",
    );
  }
}

export function assertInvoiceStillOpen(invoice: SellerInvoice): void {
  if (invoice.status === "paid") {
    throw new BillingDomainError(
      "La factura ya fue pagada",
      "INVOICE_ALREADY_PAID",
    );
  }
  if (invoice.status !== "open") {
    throw new BillingDomainError(
      `La factura en estado "${invoice.status}" no puede liquidarse por revisión manual`,
      "INVOICE_NOT_OPEN",
    );
  }
}

// Metadata builders for Phase 3 audit events

export function buildUnderReviewMetadata(params: {
  input: MarkManualPaymentUnderReviewInput;
  report: SellerManualPaymentReport;
}): Record<string, unknown> {
  return {
    source: "markManualPaymentUnderReview",
    report_id: params.report.id,
    payment_id: params.report.payment_id,
    invoice_id: params.report.invoice_id,
    seller_id: params.report.seller_id,
    admin_id: params.input.adminId,
    previous_status: params.report.status,
  };
}

export function buildApprovalMetadata(params: {
  input: ApproveManualPaymentInput;
  report: SellerManualPaymentReport;
  periodStart: string;
  periodEnd: string;
}): Record<string, unknown> {
  return {
    source: "approveManualPayment",
    report_id: params.report.id,
    payment_id: params.report.payment_id,
    invoice_id: params.report.invoice_id,
    seller_id: params.report.seller_id,
    admin_id: params.input.adminId,
    period_start: params.periodStart,
    period_end: params.periodEnd,
  };
}

export function buildRejectionMetadata(params: {
  input: RejectManualPaymentInput;
  report: SellerManualPaymentReport;
}): Record<string, unknown> {
  return {
    source: "rejectManualPayment",
    report_id: params.report.id,
    payment_id: params.report.payment_id,
    invoice_id: params.report.invoice_id,
    seller_id: params.report.seller_id,
    admin_id: params.input.adminId,
    rejection_reason: params.input.rejectionReason,
  };
}

// Query helpers

export async function loadReportWithRelations(params: {
  reportId: number;
  sellerId?: number;
}): Promise<SellerManualPaymentReport | null> {
  const where: Record<string, unknown> = { id: params.reportId };
  if (params.sellerId !== undefined) {
    where.seller_id = params.sellerId;
  }

  return SellerManualPaymentReport.findOne({ where });
}

export async function listManualPaymentReports(
  input: ListManualPaymentReportsInput,
): Promise<{ rows: SellerManualPaymentReport[]; count: number }> {
  // WhereOptions allows both string and symbol keys (Sequelize Op symbols).
  const where: Record<string | symbol, unknown> = {};

  if (input.status) where.status = input.status;
  if (input.sellerId) where.seller_id = input.sellerId;
  if (input.invoiceId) where.invoice_id = input.invoiceId;

  if (input.dateFrom || input.dateTo) {
    const createdAtFilter: Record<symbol, unknown> = {};
    if (input.dateFrom) {
      createdAtFilter[Op.gte] = parseDateOnlyToUtc(input.dateFrom);
    }
    if (input.dateTo) {
      // Include the full end day by adding one day
      const endDate = parseDateOnlyToUtc(input.dateTo);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      createdAtFilter[Op.lt] = endDate;
    }
    where.created_at = createdAtFilter;
  }

  const limit = Math.min(input.limit ?? 20, 100);
  const offset = input.offset ?? 0;

  const { rows, count } = await SellerManualPaymentReport.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
}

// ─── Phase 5: Seller read-side queries ───────────────────────────────────────

/**
 * Returns the seller's "current" subscription — the one they are actively
 * managing. Priority: active > past_due > draft > paused.
 * Returns null when the seller has no active subscription flow.
 */
export async function getSellerCurrentSubscription(sellerId: number): Promise<{
  subscription: SellerSubscription;
  plan: SellerPlan;
} | null> {
  // One query: ORDER BY priority expression so the most relevant status wins.
  const subscription = await SellerSubscription.findOne({
    where: sequelize.literal(
      `seller_id = ${sellerId}
       AND status IN ('active', 'past_due', 'draft', 'paused')`,
    ) as any,
    order: sequelize.literal(
      `CASE status
         WHEN 'active'   THEN 1
         WHEN 'past_due' THEN 2
         WHEN 'draft'    THEN 3
         ELSE 4
       END ASC, created_at DESC`,
    ) as any,
  });

  if (!subscription) return null;

  const plan = await SellerPlan.findByPk(subscription.plan_id);
  if (!plan) return null; // plan was deleted — treat as no subscription

  return { subscription, plan };
}

export interface ListSellerInvoicesParams {
  sellerId: number;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit: number;
  offset: number;
}

export interface SellerInvoiceListRow {
  invoice: SellerInvoice;
  latestPayment: { id: number; provider: string; status: string } | null;
}

/**
 * Returns a paginated invoice list for a seller, enriched with the latest
 * payment attempt per invoice. Two queries total — no N+1.
 */
export async function listSellerInvoices(params: ListSellerInvoicesParams): Promise<{
  rows: SellerInvoiceListRow[];
  total: number;
}> {
  const where: Record<string | symbol, unknown> = { seller_id: params.sellerId };

  if (params.status) where.status = params.status;

  if (params.dateFrom || params.dateTo) {
    const createdAtFilter: Record<symbol, unknown> = {};
    if (params.dateFrom) createdAtFilter[Op.gte] = parseDateOnlyToUtc(params.dateFrom);
    if (params.dateTo) {
      const end = parseDateOnlyToUtc(params.dateTo);
      end.setUTCDate(end.getUTCDate() + 1);
      createdAtFilter[Op.lt] = end;
    }
    where.created_at = createdAtFilter;
  }

  const limit  = Math.min(params.limit, 50);
  const offset = params.offset;

  const { rows: invoices, count } = await SellerInvoice.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  if (invoices.length === 0) return { rows: [], total: count };

  // Batch-fetch latest payment per invoice in one query, pick first per invoice in JS.
  const invoiceIds = invoices.map((i) => i.id);
  const payments = await SellerBillingPayment.findAll({
    where: { invoice_id: invoiceIds } as any,
    attributes: ["id", "invoice_id", "provider", "status"],
    order: [["created_at", "DESC"]],
  });

  // Build a map: invoiceId → first (latest) payment row.
  const latestPaymentMap = new Map<number, { id: number; provider: string; status: string }>();
  for (const p of payments) {
    if (!latestPaymentMap.has(p.invoice_id)) {
      latestPaymentMap.set(p.invoice_id, {
        id:       p.id,
        provider: p.provider,
        status:   p.status,
      });
    }
  }

  const rows: SellerInvoiceListRow[] = invoices.map((inv) => ({
    invoice:        inv,
    latestPayment:  latestPaymentMap.get(inv.id) ?? null,
  }));

  return { rows, total: count };
}

export interface SellerInvoiceDetail {
  invoice:  SellerInvoice;
  items:    SellerInvoiceItem[];
  payments: SellerBillingPayment[];
}

/**
 * Returns full invoice detail (items + payment attempts) for a seller-owned invoice.
 * Returns null if not found or if the invoice belongs to a different seller.
 */
export async function getSellerInvoiceDetail(
  invoiceId: number,
  sellerId: number,
): Promise<SellerInvoiceDetail | null> {
  const invoice = await SellerInvoice.findOne({
    where: { id: invoiceId, seller_id: sellerId },
  });

  if (!invoice) return null;

  const [items, payments] = await Promise.all([
    SellerInvoiceItem.findAll({
      where: { invoice_id: invoiceId },
      order: [["id", "ASC"]],
    }),
    SellerBillingPayment.findAll({
      where: { invoice_id: invoiceId },
      order: [["created_at", "DESC"]],
    }),
  ]);

  return { invoice, items, payments };
}

export interface ListSellerPaymentsParams {
  sellerId:  number;
  status?:   string | null;
  invoiceId?: number | null;
  limit:     number;
  offset:    number;
}

export interface SellerPaymentListRow {
  payment:       SellerBillingPayment;
  invoiceNumber: string;
  reportStatus:  string | null;
}

/**
 * Returns a paginated payment list for a seller, enriched with invoice number
 * and manual report status. Three queries total — no N+1.
 */
export async function listSellerPayments(params: ListSellerPaymentsParams): Promise<{
  rows: SellerPaymentListRow[];
  total: number;
}> {
  const where: Record<string | symbol, unknown> = { seller_id: params.sellerId };

  if (params.status)    where.status     = params.status;
  if (params.invoiceId) where.invoice_id = params.invoiceId;

  const limit  = Math.min(params.limit, 50);
  const offset = params.offset;

  const { rows: payments, count } = await SellerBillingPayment.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  if (payments.length === 0) return { rows: [], total: count };

  const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))];
  const paymentIds = payments.map((p) => p.id);

  // Batch-fetch invoice numbers and report statuses in parallel.
  const [invoices, reports] = await Promise.all([
    SellerInvoice.findAll({
      where: { id: invoiceIds } as any,
      attributes: ["id", "invoice_number"],
    }),
    SellerManualPaymentReport.findAll({
      where: { payment_id: paymentIds } as any,
      attributes: ["payment_id", "status"],
    }),
  ]);

  const invoiceNumberMap = new Map<number, string>(
    invoices.map((i) => [i.id, i.invoice_number]),
  );
  const reportStatusMap = new Map<number, string>(
    reports.map((r) => [r.payment_id, r.status]),
  );

  const rows: SellerPaymentListRow[] = payments.map((p) => ({
    payment:       p,
    invoiceNumber: invoiceNumberMap.get(p.invoice_id) ?? "",
    reportStatus:  reportStatusMap.get(p.id) ?? null,
  }));

  return { rows, total: count };
}

export interface SellerPaymentDetail {
  payment: SellerBillingPayment;
  invoice: SellerInvoice;
  report:  SellerManualPaymentReport | null;
}

/**
 * Returns full payment detail (linked invoice + manual report) for a seller-owned payment.
 * Returns null if not found or owned by a different seller.
 */
export async function getSellerPaymentDetail(
  paymentId: number,
  sellerId: number,
): Promise<SellerPaymentDetail | null> {
  const payment = await SellerBillingPayment.findOne({
    where: { id: paymentId, seller_id: sellerId },
  });

  if (!payment) return null;

  const [invoice, report] = await Promise.all([
    SellerInvoice.findByPk(payment.invoice_id),
    SellerManualPaymentReport.findOne({ where: { payment_id: paymentId } }),
  ]);

  if (!invoice) return null; // referential integrity broken — surface as not-found

  return { payment, invoice, report };
}
