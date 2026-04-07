// src/models/SellerPlanFeature.model.ts
//
// Feature capabilities per plan, stored as key/value pairs.
// Append-only — rows are never updated. If a feature value changes for a plan,
// a new row is inserted (or the service re-seeds the value).
//
// IMPORTANT: feature_value is always a string. The service layer casts to the
// appropriate type:
//   "5"        → Number("5")
//   "true"     → value === "true"
//   "advanced" → used as-is
//
// max_products and max_photos_per_product are NOT stored here — they live as
// columns on seller_plans where they can be enforced directly by the service.
// Features here are for display and extra capabilities only.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

class SellerPlanFeature extends Model<
  InferAttributes<SellerPlanFeature>,
  InferCreationAttributes<SellerPlanFeature, { omit: "id" | "created_at" }>
> {
  declare id:            CreationOptional<number>;
  declare plan_id:       number;
  declare feature_key:   string;
  declare feature_value: string;
  declare display_label: string;
  declare created_at:    CreationOptional<Date>;
}

SellerPlanFeature.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    plan_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    feature_key: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    feature_value: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    display_label: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    created_at: {
      type:         DataTypes.DATE,
      allowNull:    false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "seller_plan_features",
    timestamps: false,
    indexes: [
      { fields: ["plan_id", "feature_key"], unique: true },
      { fields: ["feature_key"] },
    ],
  },
);

export default SellerPlanFeature;
