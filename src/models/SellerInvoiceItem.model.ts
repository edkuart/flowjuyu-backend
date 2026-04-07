// src/models/SellerInvoiceItem.model.ts
//
// A single line item on a seller invoice. Append-only — never updated after creation.
// If a line item is wrong, the parent invoice is voided and a replacement is issued.
//
// total_amount is a denormalized snapshot (quantity × unit_amount) computed at
// creation time and never recalculated. This preserves the invoice as a historical
// record even if pricing logic changes.
//
// period_start / period_end: DATEONLY → string "YYYY-MM-DD" at runtime.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

class SellerInvoiceItem extends Model<
  InferAttributes<SellerInvoiceItem>,
  InferCreationAttributes<SellerInvoiceItem, { omit: "id" | "created_at" }>
> {
  declare id:           CreationOptional<number>;
  declare invoice_id:   number;
  declare description:  string;
  declare quantity:     number;
  declare unit_amount:  number;
  // Snapshot: quantity × unit_amount. Never recalculated after creation.
  declare total_amount: number;
  // DATEONLY → string "YYYY-MM-DD" at runtime. null for non-subscription items.
  declare period_start: string | null;
  declare period_end:   string | null;
  declare feature_key:  string | null;
  declare metadata:     object | null;
  declare created_at:   CreationOptional<Date>;
}

SellerInvoiceItem.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    invoice_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    quantity: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 1,
      validate:     { min: 1 },
    },
    unit_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    total_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    period_start: {
      type:      DataTypes.DATEONLY,
      allowNull: true,
    },
    period_end: {
      type:      DataTypes.DATEONLY,
      allowNull: true,
    },
    feature_key: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    metadata: {
      type:      DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      allowNull:    false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "seller_invoice_items",
    timestamps: false,
    indexes: [
      { fields: ["invoice_id"] },
    ],
  },
);

export default SellerInvoiceItem;
