// src/models/index.ts

import { sequelize } from "../config/db";

import { User } from "./user.model";
import { VendedorPerfil } from "./VendedorPerfil";
import { Ticket } from "./ticket.model";
import { TicketMessage } from "./ticketMessage.model";

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
};

export const models = {
  User,
  VendedorPerfil,
  Ticket,
  TicketMessage,
};
