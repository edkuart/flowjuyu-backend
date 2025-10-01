// src/models/index.ts
import { sequelize } from "../config/db";
import { User } from "./user.model";
import { VendedorPerfil } from "./VendedorPerfil";

// Asociaciones centralizadas
User.hasOne(VendedorPerfil, {
  foreignKey: "user_id",
  as: "perfil",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

VendedorPerfil.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

// Exportar sequelize y modelos
export { sequelize, User, VendedorPerfil };

// Exportar colección para recorridos (tests, migraciones, etc.)
export const models = { User, VendedorPerfil };
