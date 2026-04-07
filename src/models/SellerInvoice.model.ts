// src/models/SellerInvoice.model.ts
//
// A billing invoice issued to a seller. Once emitted (status = "open"), the
// invoice is a historical record and must never be mutated. To correct an
// error, void the invoice and create a replacement.
//
// STATUS MACHINE:
//   draft         → open            (invoice finalized and sent to seller)
//   open          → paid            (payment confirmed via webhook or admin)
//   open          → void            (admin cancels before payment)
//   open          → uncollectible   (admin marks as irrecoverable debt)
//   draft         → void            (admin discards a draft)
//
// invoice_number format: FLW-YYYY-NNNNN
//   Generated in the service layer using PostgreSQL SEQUENCE seller_invoice_number_seq.
//   The year prefix is visual only — the counter never resets across years.
//
// due_date: DATEONLY → Sequelize returns as string "YYYY-MM-DD". Declare as string.
//
// FINANCIAL INVARIANTS:
//   total_amount = subtotal_amount + tax_amount  (computed before create, never recalc)
//   Amounts are DECIMAL(12,2) — always use Number() when reading in JavaScript.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export type InvoiceType   = "subscription" | "extra" | "manual";

class SellerInvoice extends Model<
  InferAttributes<SellerInvoice>,
  InferCreationAttributes<SellerInvoice, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:              CreationOptional<number>;
  declare seller_id:       number;
  declare subscription_id: number | null;
  declare invoice_number:  string;
  declare type:            InvoiceType;
  declare status:          InvoiceStatus;
  declare subtotal_amount: number;
  declare tax_amount:      number;
  declare total_amount:    number;
  declare currency:        string;
  // DATEONLY → string "YYYY-MM-DD" at runtime.
  declare due_date:        string;
  declare paid_at:         Date | null;
  declare sent_at:         Date | null;
  declare voided_at:       Date | null;
  declare voided_by:       number | null;
  declare notes:           string | null;
  declare metadata:        object | null;
  declare created_at:      CreationOptional<Date>;
  declare updated_at:      CreationOptional<Date>;
}

SellerInvoice.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    seller_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    subscription_id: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    invoice_number: {
      type:      DataTypes.STRING(50),
      allowNull: false,
      unique:    true,
    },
    type: {
      type:      DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [["subscription", "extra", "manual"]],
      },
    },
    status: {
      type:         DataTypes.STRING(30),
      allowNull:    false,
      defaultValue: "draft",
      validate: {
        isIn: [["draft", "open", "paid", "void", "uncollectible"]],
      },
    },
    subtotal_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    tax_amount: {
      type:         DataTypes.DECIMAL(12, 2),
      allowNull:    false,
      defaultValue: 0,
    },
    total_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    currency: {
      type:         DataTypes.STRING(3),
      allowNull:    false,
      defaultValue: "GTQ",
    },
    due_date: {
      type:      DataTypes.DATEONLY,
      allowNull: false,
    },
    paid_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    sent_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    voided_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    voided_by: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type:      DataTypes.JSONB,
      allowNull: true,
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
    tableName:  "seller_invoices",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["invoice_number"], unique: true },
      { fields: ["seller_id", "status"] },
      { fields: ["seller_id", "created_at"] },
      { fields: ["status", "due_date"] },
      { fields: ["subscription_id"] },
    ],
  },
);

export default SellerInvoice;
