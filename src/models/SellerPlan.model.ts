// src/models/SellerPlan.model.ts
//
// Represents an available subscription plan (Básico, Pro, Premium).
//
// INVARIANTS:
//   - Never update price_monthly on an existing row. If the price changes,
//     mark the row is_active = false and create a new plan. Existing
//     subscriptions reference price_at_signup, not this field.
//   - max_products and max_photos_per_product are the authoritative enforcement
//     columns. Duplicate entries in seller_plan_features are for display only.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

class SellerPlan extends Model<
  InferAttributes<SellerPlan>,
  InferCreationAttributes<SellerPlan, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:                     CreationOptional<number>;
  declare name:                   string;
  declare slug:                   string;
  declare description:            string | null;
  // DECIMAL(12,2) — Sequelize returns as string at runtime. Use Number() when reading.
  declare price_monthly:          number;
  declare price_yearly:           number | null;
  declare currency:               string;
  declare max_products:           number;
  declare max_photos_per_product: number;
  declare is_active:              boolean;
  declare is_public:              boolean;
  declare sort_order:             number;
  declare created_at:             CreationOptional<Date>;
  declare updated_at:             CreationOptional<Date>;
}

SellerPlan.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    name: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    slug: {
      type:      DataTypes.STRING(50),
      allowNull: false,
      unique:    true,
      validate:  { is: /^[a-z0-9-]+$/ },
    },
    description: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    price_monthly: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate:  { min: 0 },
    },
    price_yearly: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: true,
      validate:  { min: 0 },
    },
    currency: {
      type:         DataTypes.STRING(3),
      allowNull:    false,
      defaultValue: "GTQ",
    },
    max_products: {
      type:      DataTypes.INTEGER,
      allowNull: false,
      validate:  { min: 0 },
    },
    max_photos_per_product: {
      type:      DataTypes.INTEGER,
      allowNull: false,
      validate:  { min: 1 },
    },
    is_active: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    is_public: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    sort_order: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
    },
    updated_at: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    tableName:  "seller_plans",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["slug"],                      unique: true },
      { fields: ["is_active", "is_public"] },
      { fields: ["sort_order"] },
    ],
  },
);

export default SellerPlan;
