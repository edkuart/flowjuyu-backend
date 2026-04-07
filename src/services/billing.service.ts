import type { Transaction } from "sequelize";
import { sequelize } from "../config/db";
import SellerBillingPayment from "../models/SellerBillingPayment.model";
import SellerInvoice from "../models/SellerInvoice.model";
import SellerInvoiceItem from "../models/SellerInvoiceItem.model";
import SellerManualPaymentReport from "../models/SellerManualPaymentReport.model";
import SellerSubscription from "../models/SellerSubscription.model";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { logAuditEvent } from "./audit.service";
import { getBillingProviderAdapter } from "./billing.providers";
import { createNotification } from "../utils/notifications";
import {
  assertActivationConsistency,
  assertApprovalConsistency,
  assertInvoiceCanGeneratePaymentLink,
  assertInvoiceStillOpen,
  assertManualPaymentReportEligibility,
  assertNoConfirmedPaymentAttempt,
  assertNoConflictingSubscriptionFlow,
  assertPaymentStillManualPending,
  assertReportCanBeApproved,
  assertReportCanBeMarkedUnderReview,
  assertReportCanBeRejected,
  assertSettlementStatuses,
  assertSubscriptionCanBeActivated,
  assertSubscriptionInvoiceable,
  allocateInvoiceNumber,
  buildActivationMetadata,
  buildApprovalMetadata,
  buildInvoiceIdentityScope,
  buildInvoiceMetadata,
  buildManualPaymentReportMetadata,
  buildPaymentMetadata,
  buildRejectionMetadata,
  buildSubscriptionMetadata,
  buildSubscriptionInvoiceItems,
  buildUnderReviewMetadata,
  computeInvoiceTotals,
  deriveActivationPeriod,
  deriveGracePeriodEnd,
  deriveInvoiceCoveragePeriod,
  deriveInvoiceDueDate,
  expireStalePaymentAttempts,
  findActiveNoRenewSubscriptionsExpired,
  findActiveSubscriptionsOverdue,
  findManualPaymentReportByPaymentId,
  findExistingInvoiceByScope,
  findPastDueSubscriptionsExpired,
  findReusablePaymentAttempt,
  findReusableDraftSubscription,
  findSubscriptionsDueForRenewalInvoice,
  generatePaymentAttemptIdempotencyKey,
  hashInvoiceIdentityScope,
  listManualPaymentReports as queryListManualPaymentReports,
  loadInvoicePayments,
  loadPlanForSubscriptionCreation,
  loadPlanName,
  loadReportWithRelations,
  lockInvoiceForActivation,
  lockInvoiceForPaymentLink,
  lockPaymentForActivation,
  lockReportForReview,
  lockSellerForSubscriptionFlow,
  lockSellerSubscriptions,
  lockSubscriptionForActivation,
  lockSubscriptionForInvoicing,
  normalizeMoney,
  nowUtcDate,
  selectSubscriptionPrice,
  subscriptionHasActivePaymentAttempt,
  validateActivateSubscriptionInput,
  validateApproveManualPaymentInput,
  validateCreateSubscriptionInput,
  validateGeneratePaymentLinkInput,
  validateGenerateInvoiceInput,
  validateMarkManualPaymentUnderReviewInput,
  validateRejectManualPaymentInput,
  validateReportManualPaymentInput,
} from "./billing.helpers";
import type {
  ActivateSubscriptionInput,
  ActivateSubscriptionResult,
  ApproveManualPaymentInput,
  ApproveManualPaymentResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  GeneratePaymentLinkInput,
  GeneratePaymentLinkResult,
  GenerateInvoiceInput,
  GenerateInvoiceResult,
  GetManualPaymentReportDetailInput,
  InvoiceItemDraft,
  ListManualPaymentReportsInput,
  ListManualPaymentReportsResult,
  ManualPaymentReportDetail,
  MarkManualPaymentUnderReviewInput,
  MarkManualPaymentUnderReviewResult,
  RejectManualPaymentInput,
  RejectManualPaymentResult,
  RenewalCronResult,
  ReportManualPaymentInput,
  ReportManualPaymentResult,
} from "./billing.types";
import { BillingDomainError } from "./billing.types";

function mapInvoiceItemsToCreate(invoiceId: number, items: InvoiceItemDraft[]) {
  return items.map((item) => ({
    invoice_id: invoiceId,
    description: item.description,
    quantity: item.quantity,
    unit_amount: item.unitAmount,
    total_amount: item.totalAmount,
    period_start: item.periodStart,
    period_end: item.periodEnd,
    feature_key: item.featureKey,
    metadata: item.metadata,
  }));
}

async function createInvoiceItems(
  invoiceId: number,
  items: InvoiceItemDraft[],
  transaction: Transaction,
): Promise<SellerInvoiceItem[]> {
  return SellerInvoiceItem.bulkCreate(
    mapInvoiceItemsToCreate(invoiceId, items),
    {
      transaction,
      returning: true,
    },
  );
}

export async function generateInvoice(
  input: GenerateInvoiceInput,
): Promise<GenerateInvoiceResult> {
  validateGenerateInvoiceInput(input);

  const result = await sequelize.transaction(async (t) => {
    // FOR UPDATE on seller_subscriptions is the serialization anchor that
    // prevents duplicate invoices under concurrent requests.
    const subscription = await lockSubscriptionForInvoicing({
      sellerId: input.sellerId,
      subscriptionId: input.subscriptionId,
      transaction: t,
    });

    assertSubscriptionInvoiceable(subscription, input.reason);

    const priceAtSignup = normalizeMoney(subscription.price_at_signup);
    const currency = subscription.currency_at_signup;
    const { periodStart, periodEnd } = deriveInvoiceCoveragePeriod(subscription, input.reason);

    const idempotencyScope = buildInvoiceIdentityScope({
      sellerId: input.sellerId,
      subscriptionId: input.subscriptionId,
      reason: input.reason,
      billingCycle: subscription.billing_cycle,
      currency,
      priceAtSignup,
      periodStart,
      periodEnd,
    });
    const idempotencyHash = hashInvoiceIdentityScope(idempotencyScope);

    // Business-level idempotency: look for an equivalent invoice event after
    // the subscription lock has been acquired, so a concurrent caller reuses it.
    const existing = await findExistingInvoiceByScope({
      sellerId: input.sellerId,
      subscriptionId: input.subscriptionId,
      idempotencyHash,
      transaction: t,
    });

    if (existing) {
      return {
        invoice: existing.invoice,
        items: existing.items,
        reused: true,
      };
    }

    const planName = await loadPlanName(subscription, t);
    const itemDrafts = buildSubscriptionInvoiceItems({
      subscription,
      planName,
      reason: input.reason,
      periodStart,
      periodEnd,
    });
    const totals = computeInvoiceTotals(itemDrafts);
    const invoiceNumber = await allocateInvoiceNumber(t);
    const dueDate = deriveInvoiceDueDate();

    const invoice = await SellerInvoice.create(
      {
        seller_id: input.sellerId,
        subscription_id: subscription.id,
        invoice_number: invoiceNumber,
        type: "subscription",
        status: "open",
        subtotal_amount: totals.subtotalAmount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        currency,
        due_date: dueDate,
        paid_at: null,
        sent_at: null,
        voided_at: null,
        voided_by: null,
        notes: input.notes ?? null,
        metadata: buildInvoiceMetadata({
          input,
          subscription,
          periodStart,
          periodEnd,
          idempotencyScope,
          idempotencyHash,
        }),
      },
      { transaction: t },
    );

    const items = await createInvoiceItems(invoice.id, itemDrafts, t);

    return {
      invoice,
      items,
      reused: false,
    };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? "system",
    action: result.reused ? "billing.invoice.reused" : "billing.invoice.generated",
    entity_type: "seller_invoice",
    entity_id: String(result.invoice.id),
    target_user_id: input.sellerId,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "medium",
    metadata: {
      seller_id: input.sellerId,
      subscription_id: input.subscriptionId,
      invoice_number: result.invoice.invoice_number,
      reason: input.reason,
      reused: result.reused,
      total_amount: normalizeMoney(result.invoice.total_amount),
      due_date: result.invoice.due_date,
    },
  });

  return result;
}

interface SubscriptionDraftPhaseResult {
  subscription: SellerSubscription;
  reusedSubscription: boolean;
}

async function createOrReuseDraftSubscription(
  input: CreateSubscriptionInput,
): Promise<SubscriptionDraftPhaseResult> {
  return sequelize.transaction(async (t) => {
    // Lock the seller row first so that "no existing subscriptions yet" still
    // serializes correctly under concurrent signup attempts.
    await lockSellerForSubscriptionFlow({
      sellerId: input.sellerId,
      transaction: t,
    });

    const plan = await loadPlanForSubscriptionCreation({
      planId: input.planId,
      billingCycle: input.billingCycle,
      transaction: t,
    });

    const subscriptions = await lockSellerSubscriptions({
      sellerId: input.sellerId,
      transaction: t,
    });

    const reusableDraft = findReusableDraftSubscription({
      subscriptions,
      planId: input.planId,
      billingCycle: input.billingCycle,
    });

    if (reusableDraft) {
      return {
        subscription: reusableDraft,
        reusedSubscription: true,
      };
    }

    assertNoConflictingSubscriptionFlow({
      subscriptions,
      planId: input.planId,
      billingCycle: input.billingCycle,
    });

    const priceAtSignup = selectSubscriptionPrice({
      plan,
      billingCycle: input.billingCycle,
    });

    const subscription = await SellerSubscription.create(
      {
        seller_id: input.sellerId,
        plan_id: plan.id,
        status: "draft",
        billing_cycle: input.billingCycle,
        price_at_signup: priceAtSignup,
        currency_at_signup: plan.currency,
        current_period_start: null,
        current_period_end: null,
        grace_period_end: null,
        auto_renew: input.autoRenew ?? true,
        cancelled_at: null,
        cancellation_reason: null,
        paused_at: null,
        paused_by: null,
        resumed_at: null,
        last_payment_id: null,
        metadata: buildSubscriptionMetadata({
          input,
          plan,
          priceAtSignup,
        }),
      },
      { transaction: t },
    );

    return {
      subscription,
      reusedSubscription: false,
    };
  });
}

export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  validateCreateSubscriptionInput(input);

  // Phase 1: create or reuse the draft subscription under a seller-scoped lock.
  const draftPhase = await createOrReuseDraftSubscription(input);

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? "system",
    action: draftPhase.reusedSubscription
      ? "billing.subscription.reused"
      : "billing.subscription.created",
    entity_type: "seller_subscription",
    entity_id: String(draftPhase.subscription.id),
    target_user_id: input.sellerId,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "medium",
    metadata: {
      seller_id: input.sellerId,
      plan_id: input.planId,
      billing_cycle: input.billingCycle,
      reused: draftPhase.reusedSubscription,
      subscription_status: draftPhase.subscription.status,
    },
  });

  // Phase 2: delegate invoice creation to generateInvoice(), which already
  // owns period derivation, locking, idempotency, and invoice numbering.
  const invoicePhase = await generateInvoice({
    sellerId: input.sellerId,
    subscriptionId: draftPhase.subscription.id,
    reason: "initial_subscription",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    notes: input.notes,
    metadata: input.metadata,
  });

  return {
    subscription: draftPhase.subscription,
    invoice: invoicePhase.invoice,
    invoiceItems: invoicePhase.items,
    reusedSubscription: draftPhase.reusedSubscription,
    reusedInvoice: invoicePhase.reused,
  };
}

export async function generatePaymentLink(
  input: GeneratePaymentLinkInput,
): Promise<GeneratePaymentLinkResult> {
  validateGeneratePaymentLinkInput(input);

  const result = await sequelize.transaction(async (t) => {
    // Invoice-level FOR UPDATE is the serialization anchor for payment attempt
    // generation so concurrent callers cannot create duplicate active attempts.
    const invoice = await lockInvoiceForPaymentLink({
      invoiceId: input.invoiceId,
      transaction: t,
    });

    assertInvoiceCanGeneratePaymentLink(invoice);

    const now = nowUtcDate();
    const payments = await loadInvoicePayments({
      invoiceId: invoice.id,
      transaction: t,
    });

    assertNoConfirmedPaymentAttempt(payments);

    await expireStalePaymentAttempts({
      payments,
      now,
      transaction: t,
    });

    const refreshedPayments = await loadInvoicePayments({
      invoiceId: invoice.id,
      transaction: t,
    });

    const reusablePayment = findReusablePaymentAttempt({
      payments: refreshedPayments,
      provider: input.provider,
      now,
    });

    if (reusablePayment) {
      const reusableMeta =
        reusablePayment.metadata && typeof reusablePayment.metadata === "object" && !Array.isArray(reusablePayment.metadata)
          ? reusablePayment.metadata as Record<string, unknown>
          : null;

      return {
        payment: reusablePayment,
        reused: true,
        paymentLink: reusablePayment.provider_link,
        linkExpiresAt: reusablePayment.provider_link_expires_at,
        providerReference: reusablePayment.provider_reference,
        paymentMethodDetail: reusablePayment.payment_method_detail,
        instructions:
          reusableMeta?.instructions && typeof reusableMeta.instructions === "object" && !Array.isArray(reusableMeta.instructions)
            ? reusableMeta.instructions as Record<string, unknown>
            : null,
      };
    }

    const idempotencyKey = generatePaymentAttemptIdempotencyKey({
      invoiceId: invoice.id,
      provider: input.provider,
    });

    const providerAdapter = getBillingProviderAdapter(input.provider);
    const providerSession = await providerAdapter.createSession({
      invoice,
      idempotencyKey,
      request: input,
    });

    const payment = await SellerBillingPayment.create(
      {
        invoice_id: invoice.id,
        seller_id: invoice.seller_id,
        provider: input.provider,
        provider_reference: providerSession.providerReference,
        provider_link: providerSession.paymentLink,
        provider_link_expires_at: providerSession.linkExpiresAt,
        amount: normalizeMoney(invoice.total_amount),
        currency: invoice.currency,
        status: providerSession.initialStatus,
        payment_method_detail: providerSession.paymentMethodDetail,
        confirmed_at: null,
        confirmed_by: null,
        failure_reason: null,
        notes: input.notes ?? null,
        idempotency_key: idempotencyKey,
        metadata: buildPaymentMetadata({
          input,
          idempotencyKey,
          providerSession,
        }),
      },
      { transaction: t },
    );

    return {
      payment,
      reused: false,
      paymentLink: payment.provider_link,
      linkExpiresAt: payment.provider_link_expires_at,
      providerReference: payment.provider_reference,
      paymentMethodDetail: payment.payment_method_detail,
      instructions: providerSession.instructions,
    };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? "system",
    action: result.reused ? "billing.payment_link.reused" : "billing.payment_link.generated",
    entity_type: "seller_billing_payment",
    entity_id: String(result.payment.id),
    target_user_id: result.payment.seller_id,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "medium",
    metadata: {
      invoice_id: result.payment.invoice_id,
      provider: result.payment.provider,
      reused: result.reused,
      payment_id: result.payment.id,
      provider_reference: result.providerReference,
      has_link: result.paymentLink !== null,
      status: result.payment.status,
      amount: normalizeMoney(result.payment.amount),
    },
  });

  return result;
}

export async function activateSubscription(
  input: ActivateSubscriptionInput,
): Promise<ActivateSubscriptionResult> {
  validateActivateSubscriptionInput(input);

  const result = await sequelize.transaction(async (t) => {
    // Lock ordering is fixed to avoid deadlocks across settlement paths:
    // payment -> invoice -> subscription.
    const payment = await lockPaymentForActivation({
      paymentId: input.paymentId,
      transaction: t,
    });

    const invoice = await lockInvoiceForActivation({
      invoiceId: payment.invoice_id,
      transaction: t,
    });

    if (invoice.subscription_id === null) {
      throw new Error("unreachable");
    }

    const subscription = await lockSubscriptionForActivation({
      subscriptionId: invoice.subscription_id,
      transaction: t,
    });

    assertActivationConsistency({
      payment,
      invoice,
      subscription,
    });
    assertSubscriptionCanBeActivated(subscription);
    assertSettlementStatuses({
      payment,
      invoice,
      subscription,
    });

    // Idempotency anchor: if the subscription already points at this payment,
    // the benefits were already granted and we must not apply them twice.
    if (subscription.last_payment_id === payment.id) {
      const currentPeriodStart = subscription.current_period_start;
      const currentPeriodEnd = subscription.current_period_end;

      if (!currentPeriodStart || !currentPeriodEnd) {
        throw new Error("unreachable");
      }

      return {
        subscription,
        invoice,
        payment,
        alreadyActivated: true,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
      };
    }

    const { periodStart, periodEnd } = deriveActivationPeriod(subscription);
    const confirmedAt = input.confirmedAt ?? nowUtcDate();

    const updatedPayment = await payment.update(
      {
        status: "confirmed",
        confirmed_at: confirmedAt,
        confirmed_by: input.confirmedBy ?? payment.confirmed_by ?? null,
        payment_method_detail: input.paymentMethodDetail ?? payment.payment_method_detail,
        provider_reference: input.providerReference ?? payment.provider_reference,
        notes: input.notes ?? payment.notes,
      },
      { transaction: t },
    );

    const updatedInvoice = await invoice.update(
      {
        status: "paid",
        paid_at: confirmedAt,
      },
      { transaction: t },
    );

    const updatedSubscription = await subscription.update(
      {
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        grace_period_end: null,
        last_payment_id: payment.id,
        metadata: buildActivationMetadata({
          input,
          previousMetadata: subscription.metadata,
          paymentId: payment.id,
          periodStart,
          periodEnd,
        }),
      },
      { transaction: t },
    );

    return {
      subscription: updatedSubscription,
      invoice: updatedInvoice,
      payment: updatedPayment,
      alreadyActivated: false,
      periodStart,
      periodEnd,
    };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? input.confirmedBy ?? null,
    actor_role: input.actorRole ?? "system",
    action: result.alreadyActivated
      ? "billing.subscription.activation_reused"
      : "billing.subscription.activated",
    entity_type: "seller_subscription",
    entity_id: String(result.subscription.id),
    target_user_id: result.subscription.seller_id,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "high",
    metadata: {
      payment_id: result.payment.id,
      invoice_id: result.invoice.id,
      invoice_number: result.invoice.invoice_number,
      already_activated: result.alreadyActivated,
      period_start: result.periodStart,
      period_end: result.periodEnd,
      subscription_status: result.subscription.status,
      amount: normalizeMoney(result.payment.amount),
      currency: result.payment.currency,
    },
  });

  return result;
}

export async function reportManualPayment(
  input: ReportManualPaymentInput,
): Promise<ReportManualPaymentResult> {
  validateReportManualPaymentInput(input);

  const result = await sequelize.transaction(async (t) => {
    // Payment row is the concurrency gate: only one seller report can claim a
    // manual payment attempt at a time.
    const payment = await lockPaymentForActivation({
      paymentId: input.paymentId,
      transaction: t,
    });

    const invoice = await lockInvoiceForActivation({
      invoiceId: payment.invoice_id,
      transaction: t,
    });

    assertManualPaymentReportEligibility({
      payment,
      invoice,
      sellerId: input.sellerId,
      reportedAmount: input.reportedAmount,
      currency: input.currency,
    });

    const existingReport = await findManualPaymentReportByPaymentId({
      paymentId: payment.id,
      transaction: t,
    });

    if (existingReport) {
      throw new BillingDomainError(
        "Ya existe un reporte manual para este intento de pago",
        "DUPLICATE_MANUAL_PAYMENT_REPORT",
      );
    }

    const updatedPayment =
      payment.status === "manual_pending"
        ? payment
        : await payment.update(
            {
              status: "manual_pending",
              notes: input.notes ?? payment.notes,
            },
            { transaction: t },
          );

    const report = await SellerManualPaymentReport.create(
      {
        payment_id: payment.id,
        seller_id: input.sellerId,
        invoice_id: invoice.id,
        bank_name: input.bankName.trim(),
        deposit_reference: input.depositReference.trim(),
        depositor_name: input.depositorName.trim(),
        deposit_date: input.depositDate,
        reported_amount: input.reportedAmount,
        currency: input.currency.trim().toUpperCase(),
        receipt_file_url: input.receiptFileUrl ?? null,
        notes: input.notes ?? null,
        status: "submitted",
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        metadata: buildManualPaymentReportMetadata({ input }),
      },
      { transaction: t },
    );

    return {
      payment: updatedPayment,
      invoice,
      report,
    };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? input.sellerId,
    actor_role: input.actorRole ?? "seller",
    action: "billing.manual_payment.reported",
    entity_type: "seller_manual_payment_report",
    entity_id: String(result.report.id),
    target_user_id: input.sellerId,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "medium",
    metadata: {
      payment_id: result.payment.id,
      invoice_id: result.invoice.id,
      seller_id: input.sellerId,
      report_status: result.report.status,
      payment_status: result.payment.status,
      bank_name: result.report.bank_name,
      deposit_reference: result.report.deposit_reference,
      reported_amount: normalizeMoney(result.report.reported_amount),
      currency: result.report.currency,
    },
  });

  return result;
}

// ─── Phase 3: Manual Payment Admin Review ────────────────────────────────────

export async function markManualPaymentUnderReview(
  input: MarkManualPaymentUnderReviewInput,
): Promise<MarkManualPaymentUnderReviewResult> {
  validateMarkManualPaymentUnderReviewInput(input);

  const result = await sequelize.transaction(async (t) => {
    // Lock order: report first — this is the only lock needed for under_review.
    // No payment/invoice mutation occurs here.
    const report = await lockReportForReview({
      reportId: input.reportId,
      transaction: t,
    });

    assertReportCanBeMarkedUnderReview(report);

    // Idempotent: already under_review → return as-is.
    if (report.status === "under_review") {
      return { report, alreadyUnderReview: true };
    }

    const updatedReport = await report.update(
      {
        status: "under_review",
        reviewed_by: input.adminId,
        reviewed_at: nowUtcDate(),
        notes: input.notes ?? report.notes,
      },
      { transaction: t },
    );

    return { report: updatedReport, alreadyUnderReview: false };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? input.adminId,
    actor_role: input.actorRole ?? "admin",
    action: result.alreadyUnderReview
      ? "billing.manual_payment.review_reused"
      : "billing.manual_payment.under_review",
    entity_type: "seller_manual_payment_report",
    entity_id: String(result.report.id),
    target_user_id: result.report.seller_id,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "medium",
    metadata: buildUnderReviewMetadata({ input, report: result.report }),
  });

  return result;
}

export async function approveManualPayment(
  input: ApproveManualPaymentInput,
): Promise<ApproveManualPaymentResult> {
  validateApproveManualPaymentInput(input);

  const result = await sequelize.transaction(async (t) => {
    // Lock order: report → payment → invoice → subscription.
    // This is a FLAT transaction — we do NOT call activateSubscription() here
    // because that function creates its own sequelize.transaction(), which
    // would open a second connection and deadlock on the rows already locked
    // in this transaction.  Instead, we inline the activation logic using the
    // same helpers that activateSubscription() uses, sharing the transaction.
    const report = await lockReportForReview({
      reportId: input.reportId,
      transaction: t,
    });

    assertReportCanBeApproved(report);

    const payment = await lockPaymentForActivation({
      paymentId: report.payment_id,
      transaction: t,
    });

    const invoice = await lockInvoiceForActivation({
      invoiceId: report.invoice_id,
      transaction: t,
    });

    assertApprovalConsistency({ report, payment, invoice });

    if (invoice.subscription_id === null) {
      throw new BillingDomainError(
        "La factura no está vinculada a una suscripción",
        "INVOICE_HAS_NO_SUBSCRIPTION",
      );
    }

    const subscription = await lockSubscriptionForActivation({
      subscriptionId: invoice.subscription_id,
      transaction: t,
    });

    // Idempotency anchor: if the subscription already points at this payment,
    // all three state transitions already occurred — return as-is.
    if (
      report.status === "approved" &&
      payment.status === "confirmed" &&
      subscription.last_payment_id === payment.id
    ) {
      return {
        report,
        payment,
        invoice,
        subscription,
        alreadyApproved: true,
        periodStart: subscription.current_period_start ?? "",
        periodEnd: subscription.current_period_end ?? "",
      };
    }

    assertPaymentStillManualPending(payment);
    assertInvoiceStillOpen(invoice);
    assertSubscriptionCanBeActivated(subscription);

    const confirmedAt = nowUtcDate();
    const { periodStart, periodEnd } = deriveActivationPeriod(subscription);

    // Apply all four mutations inside the same transaction.
    const updatedReport = await report.update(
      {
        status: "approved",
        reviewed_by: input.adminId,
        reviewed_at: confirmedAt,
        notes: input.notes ?? report.notes,
      },
      { transaction: t },
    );

    const updatedPayment = await payment.update(
      {
        status: "confirmed",
        confirmed_at: confirmedAt,
        confirmed_by: input.adminId,
        notes: input.notes ?? payment.notes,
      },
      { transaction: t },
    );

    const updatedInvoice = await invoice.update(
      { status: "paid", paid_at: confirmedAt },
      { transaction: t },
    );

    const updatedSubscription = await subscription.update(
      {
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        grace_period_end: null,
        last_payment_id: payment.id,
        metadata: buildActivationMetadata({
          input: {
            paymentId: payment.id,
            confirmedAt,
            confirmedBy: input.adminId,
            actorUserId: input.actorUserId ?? input.adminId,
            actorRole: input.actorRole ?? "admin",
          },
          previousMetadata: subscription.metadata,
          paymentId: payment.id,
          periodStart,
          periodEnd,
        }),
      },
      { transaction: t },
    );

    return {
      report: updatedReport,
      payment: updatedPayment,
      invoice: updatedInvoice,
      subscription: updatedSubscription,
      alreadyApproved: false,
      periodStart,
      periodEnd,
    };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? input.adminId,
    actor_role: input.actorRole ?? "admin",
    action: result.alreadyApproved
      ? "billing.manual_payment.approval_reused"
      : "billing.manual_payment.approved",
    entity_type: "seller_manual_payment_report",
    entity_id: String(result.report.id),
    target_user_id: result.report.seller_id,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "high",
    metadata: buildApprovalMetadata({
      input,
      report: result.report,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
    }),
  });

  return result;
}

export async function rejectManualPayment(
  input: RejectManualPaymentInput,
): Promise<RejectManualPaymentResult> {
  validateRejectManualPaymentInput(input);

  const result = await sequelize.transaction(async (t) => {
    // Lock order: report → payment → invoice (no subscription mutation).
    const report = await lockReportForReview({
      reportId: input.reportId,
      transaction: t,
    });

    assertReportCanBeRejected(report);

    const payment = await lockPaymentForActivation({
      paymentId: report.payment_id,
      transaction: t,
    });

    const invoice = await lockInvoiceForActivation({
      invoiceId: report.invoice_id,
      transaction: t,
    });

    assertApprovalConsistency({ report, payment, invoice });

    // Idempotent replay: both already terminal-rejected.
    if (report.status === "rejected" && payment.status === "failed") {
      return { report, payment, invoice, alreadyRejected: true };
    }

    const rejectedAt = nowUtcDate();

    const updatedReport = await report.update(
      {
        status: "rejected",
        reviewed_by: input.adminId,
        reviewed_at: rejectedAt,
        rejection_reason: input.rejectionReason.trim(),
        notes: input.notes ?? report.notes,
      },
      { transaction: t },
    );

    // Mark payment failed — invoice intentionally stays open so the seller
    // can submit a new payment attempt later.
    const updatedPayment = await payment.update(
      {
        status: "failed",
        failure_reason: input.rejectionReason.trim(),
        notes: input.notes ?? payment.notes,
      },
      { transaction: t },
    );

    return {
      report: updatedReport,
      payment: updatedPayment,
      invoice,
      alreadyRejected: false,
    };
  });

  void logAuditEvent({
    actor_user_id: input.actorUserId ?? input.adminId,
    actor_role: input.actorRole ?? "admin",
    action: result.alreadyRejected
      ? "billing.manual_payment.rejection_reused"
      : "billing.manual_payment.rejected",
    entity_type: "seller_manual_payment_report",
    entity_id: String(result.report.id),
    target_user_id: result.report.seller_id,
    ip_address: "internal",
    user_agent: "",
    http_method: "",
    route: "",
    status: "success",
    severity: "high",
    metadata: buildRejectionMetadata({ input, report: result.report }),
  });

  return result;
}

export async function getManualPaymentReportDetail(
  input: GetManualPaymentReportDetailInput,
): Promise<ManualPaymentReportDetail> {
  const report = await loadReportWithRelations({
    reportId: input.reportId,
    sellerId: input.sellerId,
  });

  if (!report) {
    throw new BillingDomainError(
      "Reporte de pago no encontrado",
      "REPORT_NOT_FOUND",
    );
  }

  const [payment, invoice] = await Promise.all([
    SellerBillingPayment.findByPk(report.payment_id),
    SellerInvoice.findByPk(report.invoice_id),
  ]);

  if (!payment) {
    throw new BillingDomainError("Pago asociado no encontrado", "PAYMENT_NOT_FOUND");
  }
  if (!invoice) {
    throw new BillingDomainError("Factura asociada no encontrada", "INVOICE_NOT_FOUND");
  }

  const invoiceItems = await SellerInvoiceItem.findAll({
    where: { invoice_id: invoice.id },
    order: [["id", "ASC"]],
  });

  return { report, payment, invoice, invoiceItems };
}

export async function listManualPaymentReports(
  input: ListManualPaymentReportsInput,
): Promise<ListManualPaymentReportsResult> {
  const { rows, count } = await queryListManualPaymentReports(input);
  return { reports: rows, total: count };
}

// ─── Renewal Cron ─────────────────────────────────────────────────────────────

/**
 * BATCH SIZE governs how many subscriptions are loaded per pass.
 * Keeps each cron run bounded at O(n) queries where n = BATCH_SIZE, not
 * the total number of subscriptions in the DB.
 * Adjust up if the platform grows to thousands of active sellers.
 */
const CRON_BATCH_SIZE = 200;

/**
 * runRenewalCron()
 *
 * Two-pass lifecycle automation for seller subscriptions.
 *
 * PASS 1 — Renewal invoice generation
 *   For active subscriptions nearing period end (auto_renew=true):
 *   - Calls generateInvoice(reason:"renewal") which is fully idempotent.
 *   - Does NOT change subscription status.
 *   - Sends seller notification on new invoice creation.
 *
 * PASS 2 — Expiry transitions
 *   Sub-pass A: active, auto_renew=false, period ended → expired
 *   Sub-pass B: active, auto_renew=true, period ended, no active payment → past_due
 *   Sub-pass C: past_due, grace_period_end passed → expired
 *   - Each uses atomic UPDATE WHERE status=<expected> (compare-and-set).
 *   - On expiry: resets VendedorPerfil.plan_activo + plan_expires_at.
 *   - On past_due: sets grace_period_end.
 *   - Sends seller notification for each transition.
 *
 * IDEMPOTENCY:
 *   - Pass 1: generateInvoice uses idempotency_hash — duplicate run → reused:true.
 *   - Pass 2: UPDATE WHERE status=<old_status> → 0 rows affected on replay.
 *
 * CONCURRENCY:
 *   - Pass 1: generateInvoice serializes via lockSubscriptionForInvoicing (FOR UPDATE).
 *   - Pass 2: Atomic compare-and-set at DB level via updateCount check.
 *
 * ERROR ISOLATION:
 *   Each subscription is wrapped in its own try/catch. One failure does not
 *   abort the rest of the batch. Errors are logged and counted in the result.
 */
export async function runRenewalCron(): Promise<RenewalCronResult> {
  const runAt = new Date().toISOString();

  const result: RenewalCronResult = {
    runAt,
    pass1: {
      scanned: 0,
      invoicesCreated: 0,
      invoicesReused: 0,
      skipped: 0,
      errors: 0,
    },
    pass2: {
      scanned: 0,
      markedPastDue: 0,
      markedExpired: 0,
      skipped: 0,
      errors: 0,
    },
  };

  // ─── PASS 1: Generate renewal invoices ──────────────────────────────────────

  const renewalCandidates = await findSubscriptionsDueForRenewalInvoice({
    batchSize: CRON_BATCH_SIZE,
  });

  result.pass1.scanned = renewalCandidates.length;

  for (const sub of renewalCandidates) {
    try {
      const invoiceResult = await generateInvoice({
        sellerId:       sub.seller_id,
        subscriptionId: sub.id,
        reason:         "renewal",
        actorUserId:    null,
        actorRole:      "system",
      });

      if (invoiceResult.reused) {
        result.pass1.invoicesReused++;
      } else {
        result.pass1.invoicesCreated++;

        // Notify seller of upcoming renewal invoice (fire-and-forget).
        void createNotification(
          sub.seller_id,
          "billing",
          "Factura de renovación generada",
          `Tu suscripción vence pronto. Se generó la factura ${invoiceResult.invoice.invoice_number} por ${normalizeMoney(invoiceResult.invoice.total_amount).toFixed(2)} ${invoiceResult.invoice.currency}.`,
          `/seller/billing/invoices/${invoiceResult.invoice.id}`,
        );
      }
    } catch (err) {
      result.pass1.errors++;
      console.error(
        `[renewalCron] Pass1 error for subscription ${sub.id} (seller ${sub.seller_id}):`,
        err,
      );
    }
  }

  // ─── PASS 2A: active + auto_renew=false → expired ───────────────────────────

  const noRenewExpired = await findActiveNoRenewSubscriptionsExpired({
    batchSize: CRON_BATCH_SIZE,
  });

  result.pass2.scanned += noRenewExpired.length;

  for (const sub of noRenewExpired) {
    try {
      const [updateCount] = await SellerSubscription.update(
        { status: "expired" },
        { where: { id: sub.id, status: "active" } },
      );

      if (updateCount === 0) {
        // Another process already transitioned this subscription.
        result.pass2.skipped++;
        continue;
      }

      result.pass2.markedExpired++;
      await revokeSellerPlanBenefits(sub.seller_id);

      void logAuditEvent({
        actor_user_id: null,
        actor_role:    "system",
        action:        "billing.subscription.expired",
        entity_type:   "seller_subscription",
        entity_id:     String(sub.id),
        target_user_id: sub.seller_id,
        ip_address:    "internal",
        user_agent:    "",
        http_method:   "",
        route:         "",
        status:        "success",
        severity:      "medium",
        metadata: {
          reason:              "auto_renew_false_period_ended",
          subscription_id:     sub.id,
          seller_id:           sub.seller_id,
          current_period_end:  sub.current_period_end,
          run_at:              runAt,
        },
      });

      void createNotification(
        sub.seller_id,
        "billing",
        "Suscripción expirada",
        "Tu suscripción ha expirado. Renueva para seguir vendiendo en Flowjuyu.",
        "/seller/billing",
      );
    } catch (err) {
      result.pass2.errors++;
      console.error(
        `[renewalCron] Pass2A error for subscription ${sub.id} (seller ${sub.seller_id}):`,
        err,
      );
    }
  }

  // ─── PASS 2B: active + auto_renew=true + period ended + no active payment → past_due

  const overdueActive = await findActiveSubscriptionsOverdue({
    batchSize: CRON_BATCH_SIZE,
  });

  result.pass2.scanned += overdueActive.length;

  for (const sub of overdueActive) {
    try {
      // Skip if there is a non-terminal payment that might still settle.
      const hasActivePayment = await subscriptionHasActivePaymentAttempt(sub);
      if (hasActivePayment) {
        result.pass2.skipped++;
        continue;
      }

      const gracePeriodEnd = deriveGracePeriodEnd();

      const [updateCount] = await SellerSubscription.update(
        { status: "past_due", grace_period_end: gracePeriodEnd },
        { where: { id: sub.id, status: "active" } },
      );

      if (updateCount === 0) {
        result.pass2.skipped++;
        continue;
      }

      result.pass2.markedPastDue++;

      void logAuditEvent({
        actor_user_id: null,
        actor_role:    "system",
        action:        "billing.subscription.past_due",
        entity_type:   "seller_subscription",
        entity_id:     String(sub.id),
        target_user_id: sub.seller_id,
        ip_address:    "internal",
        user_agent:    "",
        http_method:   "",
        route:         "",
        status:        "success",
        severity:      "medium",
        metadata: {
          reason:             "period_ended_no_payment",
          subscription_id:    sub.id,
          seller_id:          sub.seller_id,
          current_period_end: sub.current_period_end,
          grace_period_end:   gracePeriodEnd,
          run_at:             runAt,
        },
      });

      void createNotification(
        sub.seller_id,
        "billing",
        "Pago de renovación pendiente",
        `Tu suscripción venció el ${sub.current_period_end}. Tienes hasta el ${gracePeriodEnd} para renovar.`,
        "/seller/billing",
      );
    } catch (err) {
      result.pass2.errors++;
      console.error(
        `[renewalCron] Pass2B error for subscription ${sub.id} (seller ${sub.seller_id}):`,
        err,
      );
    }
  }

  // ─── PASS 2C: past_due + grace_period_end passed → expired ──────────────────

  const pastDueExpired = await findPastDueSubscriptionsExpired({
    batchSize: CRON_BATCH_SIZE,
  });

  result.pass2.scanned += pastDueExpired.length;

  for (const sub of pastDueExpired) {
    try {
      const [updateCount] = await SellerSubscription.update(
        { status: "expired", grace_period_end: null },
        { where: { id: sub.id, status: "past_due" } },
      );

      if (updateCount === 0) {
        result.pass2.skipped++;
        continue;
      }

      result.pass2.markedExpired++;
      await revokeSellerPlanBenefits(sub.seller_id);

      void logAuditEvent({
        actor_user_id: null,
        actor_role:    "system",
        action:        "billing.subscription.expired",
        entity_type:   "seller_subscription",
        entity_id:     String(sub.id),
        target_user_id: sub.seller_id,
        ip_address:    "internal",
        user_agent:    "",
        http_method:   "",
        route:         "",
        status:        "success",
        severity:      "medium",
        metadata: {
          reason:            "grace_period_ended",
          subscription_id:   sub.id,
          seller_id:         sub.seller_id,
          grace_period_end:  sub.grace_period_end,
          run_at:            runAt,
        },
      });

      void createNotification(
        sub.seller_id,
        "billing",
        "Suscripción expirada",
        "Tu período de gracia ha terminado. Renueva tu suscripción para seguir vendiendo.",
        "/seller/billing",
      );
    } catch (err) {
      result.pass2.errors++;
      console.error(
        `[renewalCron] Pass2C error for subscription ${sub.id} (seller ${sub.seller_id}):`,
        err,
      );
    }
  }

  // ─── Audit the full cron run ─────────────────────────────────────────────────

  void logAuditEvent({
    actor_user_id: null,
    actor_role:    "system",
    action:        "billing.renewal_cron.completed",
    entity_type:   "system",
    entity_id:     "renewal_cron",
    target_user_id: null,
    ip_address:    "internal",
    user_agent:    "",
    http_method:   "",
    route:         "",
    status:        result.pass1.errors + result.pass2.errors > 0 ? "failed" : "success",
    severity:      "low",
    metadata:      result as unknown as Record<string, unknown>,
  });

  return result;
}

/**
 * Revokes VendedorPerfil plan benefits when a subscription expires.
 * Resets plan_activo = false and plan_expires_at = null.
 * Safe to call multiple times — UPDATE is idempotent.
 */
async function revokeSellerPlanBenefits(sellerId: number): Promise<void> {
  await VendedorPerfil.update(
    { plan_activo: false, plan_expires_at: null },
    { where: { user_id: sellerId } },
  );
}
