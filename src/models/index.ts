// src/models/index.ts

import { sequelize } from "../config/db";
import { User } from "./user.model";
import { VendedorPerfil } from "./VendedorPerfil";

/**
 * ============================================
 * 🧠 Asociaciones centralizadas
 * ============================================
 * IMPORTANTE:
 * - Declarar asociaciones SOLO aquí.
 * - No repetir en otros archivos.
 * - Evitar que se registren dos veces en hot-reload.
 */

function setupAssociations() {
  // Evitar duplicación si ya existen
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
}

setupAssociations();

/**
 * ============================================
 * 📦 Exports
 * ============================================
 */

export { sequelize, User, VendedorPerfil };

export const models = {
  User,
  VendedorPerfil,
};
