// src/models/index.ts

import { sequelize } from "../config/db";

import { User } from "./user.model";
import { VendedorPerfil } from "./VendedorPerfil";
import { Ticket } from "./ticket.model";
import { TicketMessage } from "./ticketMessage.model";

// Phase 2: AI Content Intelligence models
import { AiContentItem } from "./AiContentItem.model";
import { AiContentVariant } from "./AiContentVariant.model";
import { AiContentReview } from "./AiContentReview.model";

// Phase 3: Performance Tracking
import { AiContentPerformanceDaily } from "./AiContentPerformanceDaily.model";

// Phase 5: Adaptive Templates
import AiContentTemplate from "./AiContentTemplate.model";

// Phase 6: Distribution Analytics
import AiContentUsage from "./AiContentUsage.model";

// Security: Audit Events
import AuditEvent from "./AuditEvent.model";

// Security: Intelligence Alerts
import SecurityAlert from "./SecurityAlert.model";

// Security: Active Defense Restrictions
import SecurityRestriction from "./SecurityRestriction.model";

// Phase 5: Payment Security
import Order            from "./Order.model";
import OrderItem        from "./OrderItem.model";
import PaymentAttempt   from "./PaymentAttempt.model";
import ProcessedWebhook from "./ProcessedWebhook.model";
import ReviewResponse   from "./ReviewResponse.model";
import ReviewReport     from "./ReviewReport.model";
import ReviewSignal     from "./ReviewSignal.model";
import ReviewVote       from "./ReviewVote.model";

// Phase 6: Financial Fraud + Control
import SecurityProfile  from "./SecurityProfile.model";
import ManualReviewCase from "./ManualReviewCase.model";

// Seller Billing
import SellerPlan           from "./SellerPlan.model";
import SellerPlanFeature    from "./SellerPlanFeature.model";
import SellerSubscription   from "./SellerSubscription.model";
import SellerInvoice        from "./SellerInvoice.model";
import SellerInvoiceItem    from "./SellerInvoiceItem.model";
import SellerBillingPayment from "./SellerBillingPayment.model";
import SellerManualPaymentReport from "./SellerManualPaymentReport.model";
import ConversationSession  from "./ConversationSession.model";
import ConversationMessage  from "./ConversationMessage.model";
import ListingDraft         from "./ListingDraft.model";

/**
 * ============================================
 * 🧠 Asociaciones centralizadas
 * ============================================
 * REGLAS:
 * - Declarar asociaciones SOLO aquí
 * - No repetir asociaciones en los modelos
 * - Proteger contra hot-reload (Next / ts-node-dev)
 */

function setupAssociations() {
  /* ============================
     👤 User ↔ VendedorPerfil
  ============================ */

  if (!User.associations.perfil) {
    User.hasOne(VendedorPerfil, {
      foreignKey: "user_id",
      as: "perfil",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  }

  if (!VendedorPerfil.associations.user) {
    VendedorPerfil.belongsTo(User, {
      foreignKey: "user_id",
      as: "user",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  }

  /* ============================
     🎫 Ticket ↔ TicketMessage
  ============================ */

  if (!Ticket.associations.messages) {
    Ticket.hasMany(TicketMessage, {
      foreignKey: "ticket_id",
      as: "messages",
      onDelete: "CASCADE",
    });
  }

  if (!TicketMessage.associations.ticket) {
    TicketMessage.belongsTo(Ticket, {
      foreignKey: "ticket_id",
      as: "ticket",
      onDelete: "CASCADE",
    });
  }

  /* ============================
     👤 User ↔ Ticket
     (opcional pero recomendado)
  ============================ */

  if (!User.associations.tickets) {
    User.hasMany(Ticket, {
      foreignKey: "user_id",
      as: "tickets",
      onDelete: "CASCADE",
    });
  }

  if (!Ticket.associations.user) {
    Ticket.belongsTo(User, {
      foreignKey: "user_id",
      as: "user",
    });
  }

  /* ============================
     💬 ConversationSession ↔ ConversationMessage
  ============================ */

  if (!(ConversationSession as any).associations?.messages) {
    ConversationSession.hasMany(ConversationMessage, {
      foreignKey: "session_id",
      as: "messages",
      onDelete: "CASCADE",
    });
  }

  if (!(ConversationMessage as any).associations?.session) {
    ConversationMessage.belongsTo(ConversationSession, {
      foreignKey: "session_id",
      as: "session",
    });
  }

  if (!(ConversationSession as any).associations?.draft) {
    ConversationSession.hasOne(ListingDraft, {
      foreignKey: "session_id",
      as: "draft",
      onDelete: "CASCADE",
    });
  }

  if (!(ListingDraft as any).associations?.session) {
    ListingDraft.belongsTo(ConversationSession, {
      foreignKey: "session_id",
      as: "session",
    });
  }

  if (!(User as any).associations?.conversationSessions) {
    User.hasMany(ConversationSession, {
      foreignKey: "linked_seller_user_id",
      as: "conversationSessions",
      onDelete: "SET NULL",
    });
  }

  if (!(ConversationSession as any).associations?.seller) {
    ConversationSession.belongsTo(User, {
      foreignKey: "linked_seller_user_id",
      as: "seller",
    });
  }

  if (!(User as any).associations?.listingDrafts) {
    User.hasMany(ListingDraft, {
      foreignKey: "seller_user_id",
      as: "listingDrafts",
      onDelete: "SET NULL",
    });
  }

  if (!(ListingDraft as any).associations?.seller) {
    ListingDraft.belongsTo(User, {
      foreignKey: "seller_user_id",
      as: "seller",
    });
  }

  /* ============================
     📝 AiContentItem ↔ AiContentVariant
  ============================ */

  if (!AiContentItem.associations.variants) {
    AiContentItem.hasMany(AiContentVariant, {
      foreignKey: "content_item_id",
      as: "variants",
      onDelete: "CASCADE",
    });
  }

  if (!AiContentVariant.associations.item) {
    AiContentVariant.belongsTo(AiContentItem, {
      foreignKey: "content_item_id",
      as: "item",
    });
  }

  /* ============================
     📝 AiContentVariant ↔ AiContentReview
  ============================ */

  if (!AiContentVariant.associations.reviews) {
    AiContentVariant.hasMany(AiContentReview, {
      foreignKey: "variant_id",
      as: "reviews",
      onDelete: "CASCADE",
    });
  }

  if (!AiContentReview.associations.variant) {
    AiContentReview.belongsTo(AiContentVariant, {
      foreignKey: "variant_id",
      as: "variant",
    });
  }

  /* ============================
     📊 AiContentItem ↔ AiContentPerformanceDaily
  ============================ */

  if (!AiContentItem.associations.performance) {
    AiContentItem.hasMany(AiContentPerformanceDaily, {
      foreignKey: "content_item_id",
      as: "performance",
      onDelete: "CASCADE",
    });
  }

  if (!(AiContentPerformanceDaily as any).associations?.item) {
    AiContentPerformanceDaily.belongsTo(AiContentItem, {
      foreignKey: "content_item_id",
      as: "item",
    });
  }

  // AiContentTemplate is a standalone config table — no foreign key associations needed.
  // It is referenced by ai_content_variants.template_id (VARCHAR, not FK) for immutability.

  /* ============================
     📊 AiContentVariant ↔ AiContentUsage
  ============================ */

  if (!AiContentVariant.associations.usage) {
    AiContentVariant.hasMany(AiContentUsage, {
      foreignKey: "variant_id",
      as: "usage",
      onDelete: "CASCADE",
    });
  }

  if (!AiContentUsage.associations.variant) {
    AiContentUsage.belongsTo(AiContentVariant, {
      foreignKey: "variant_id",
      as: "variant",
    });
  }

  /* ============================
     💳 Order ↔ OrderItem
  ============================ */

  if (!Order.associations.items) {
    Order.hasMany(OrderItem, {
      foreignKey: "order_id",
      as:         "items",
      onDelete:   "CASCADE",
    });
  }

  if (!OrderItem.associations.order) {
    OrderItem.belongsTo(Order, {
      foreignKey: "order_id",
      as:         "order",
    });
  }

  /* ============================
     💳 Order ↔ PaymentAttempt
  ============================ */

  /* ============================
     🧾 Seller Billing associations
  ============================ */

  if (!SellerPlan.associations.features) {
    SellerPlan.hasMany(SellerPlanFeature, {
      foreignKey: "plan_id",
      as:         "features",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerPlanFeature.associations.plan) {
    SellerPlanFeature.belongsTo(SellerPlan, {
      foreignKey: "plan_id",
      as:         "plan",
    });
  }

  if (!SellerPlan.associations.subscriptions) {
    SellerPlan.hasMany(SellerSubscription, {
      foreignKey: "plan_id",
      as:         "subscriptions",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerSubscription.associations.plan) {
    SellerSubscription.belongsTo(SellerPlan, {
      foreignKey: "plan_id",
      as:         "plan",
    });
  }

  if (!User.associations.sellerSubscriptions) {
    User.hasMany(SellerSubscription, {
      foreignKey: "seller_id",
      as:         "sellerSubscriptions",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerSubscription.associations.seller) {
    SellerSubscription.belongsTo(User, {
      foreignKey: "seller_id",
      as:         "seller",
    });
  }

  if (!User.associations.sellerInvoices) {
    User.hasMany(SellerInvoice, {
      foreignKey: "seller_id",
      as:         "sellerInvoices",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerInvoice.associations.seller) {
    SellerInvoice.belongsTo(User, {
      foreignKey: "seller_id",
      as:         "seller",
    });
  }

  if (!SellerSubscription.associations.invoices) {
    SellerSubscription.hasMany(SellerInvoice, {
      foreignKey: "subscription_id",
      as:         "invoices",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerInvoice.associations.subscription) {
    SellerInvoice.belongsTo(SellerSubscription, {
      foreignKey: "subscription_id",
      as:         "subscription",
    });
  }

  if (!SellerInvoice.associations.items) {
    SellerInvoice.hasMany(SellerInvoiceItem, {
      foreignKey: "invoice_id",
      as:         "items",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerInvoiceItem.associations.invoice) {
    SellerInvoiceItem.belongsTo(SellerInvoice, {
      foreignKey: "invoice_id",
      as:         "invoice",
    });
  }

  if (!SellerInvoice.associations.payments) {
    SellerInvoice.hasMany(SellerBillingPayment, {
      foreignKey: "invoice_id",
      as:         "payments",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerBillingPayment.associations.invoice) {
    SellerBillingPayment.belongsTo(SellerInvoice, {
      foreignKey: "invoice_id",
      as:         "invoice",
    });
  }

  if (!User.associations.sellerBillingPayments) {
    User.hasMany(SellerBillingPayment, {
      foreignKey: "seller_id",
      as:         "sellerBillingPayments",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerBillingPayment.associations.seller) {
    SellerBillingPayment.belongsTo(User, {
      foreignKey: "seller_id",
      as:         "seller",
    });
  }

  if (!SellerBillingPayment.associations.manualReports) {
    SellerBillingPayment.hasMany(SellerManualPaymentReport, {
      foreignKey: "payment_id",
      as:         "manualReports",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerManualPaymentReport.associations.payment) {
    SellerManualPaymentReport.belongsTo(SellerBillingPayment, {
      foreignKey: "payment_id",
      as:         "payment",
    });
  }

  if (!SellerInvoice.associations.manualPaymentReports) {
    SellerInvoice.hasMany(SellerManualPaymentReport, {
      foreignKey: "invoice_id",
      as:         "manualPaymentReports",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerManualPaymentReport.associations.invoice) {
    SellerManualPaymentReport.belongsTo(SellerInvoice, {
      foreignKey: "invoice_id",
      as:         "invoice",
    });
  }

  if (!User.associations.sellerManualPaymentReports) {
    User.hasMany(SellerManualPaymentReport, {
      foreignKey: "seller_id",
      as:         "sellerManualPaymentReports",
      onDelete:   "RESTRICT",
    });
  }
  if (!SellerManualPaymentReport.associations.seller) {
    SellerManualPaymentReport.belongsTo(User, {
      foreignKey: "seller_id",
      as:         "seller",
    });
  }

  if (!User.associations.reviewedManualPaymentReports) {
    User.hasMany(SellerManualPaymentReport, {
      foreignKey: "reviewed_by",
      as:         "reviewedManualPaymentReports",
      onDelete:   "SET NULL",
    });
  }
  if (!SellerManualPaymentReport.associations.reviewer) {
    SellerManualPaymentReport.belongsTo(User, {
      foreignKey: "reviewed_by",
      as:         "reviewer",
    });
  }

  // last_payment_id circular FK (added in migration 000007)
  if (!SellerSubscription.associations.lastPayment) {
    SellerSubscription.belongsTo(SellerBillingPayment, {
      foreignKey: "last_payment_id",
      as:         "lastPayment",
    });
  }

  if (!Order.associations.paymentAttempts) {
    Order.hasMany(PaymentAttempt, {
      foreignKey: "order_id",
      as:         "paymentAttempts",
      onDelete:   "RESTRICT",
    });
  }

  if (!PaymentAttempt.associations.order) {
    PaymentAttempt.belongsTo(Order, {
      foreignKey: "order_id",
      as:         "order",
    });
  }
}

setupAssociations();

/**
 * ============================================
 * 📦 Exports oficiales
 * ============================================
 */

export {
  sequelize,
  User,
  VendedorPerfil,
  Ticket,
  TicketMessage,
  // Phase 2
  AiContentItem,
  AiContentVariant,
  AiContentReview,
  // Phase 3
  AiContentPerformanceDaily,
  // Phase 5
  AiContentTemplate,
  // Phase 6
  AiContentUsage,
  // Security
  AuditEvent,
  SecurityAlert,
  SecurityRestriction,
  // Phase 5: Payment Security
  Order,
  OrderItem,
  PaymentAttempt,
  ProcessedWebhook,
  ReviewResponse,
  ReviewReport,
  ReviewSignal,
  ReviewVote,
  // Phase 6: Financial Fraud + Control
  SecurityProfile,
  ManualReviewCase,
  // Seller Billing
  SellerPlan,
  SellerPlanFeature,
  SellerSubscription,
  SellerInvoice,
  SellerInvoiceItem,
  SellerBillingPayment,
  SellerManualPaymentReport,
  ConversationSession,
  ConversationMessage,
  ListingDraft,
};

export const models = {
  User,
  VendedorPerfil,
  Ticket,
  TicketMessage,
  // Phase 2
  AiContentItem,
  AiContentVariant,
  AiContentReview,
  // Phase 3
  AiContentPerformanceDaily,
  // Phase 5
  AiContentTemplate,
  // Phase 6 (AI)
  AiContentUsage,
  // Security
  AuditEvent,
  SecurityAlert,
  SecurityRestriction,
  // Phase 5: Payment Security
  Order,
  OrderItem,
  PaymentAttempt,
  ProcessedWebhook,
  ReviewResponse,
  ReviewReport,
  ReviewSignal,
  ReviewVote,
  // Phase 6: Financial Fraud + Control
  SecurityProfile,
  ManualReviewCase,
  // Seller Billing
  SellerPlan,
  SellerPlanFeature,
  SellerSubscription,
  SellerInvoice,
  SellerInvoiceItem,
  SellerBillingPayment,
  SellerManualPaymentReport,
  ConversationSession,
  ConversationMessage,
  ListingDraft,
};
