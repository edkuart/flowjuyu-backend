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
};
