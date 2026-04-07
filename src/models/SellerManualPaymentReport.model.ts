// src/models/SellerManualPaymentReport.model.ts
//
// Operational workflow record for seller-reported manual payments such as bank
// deposits or transfers. This is intentionally separate from
// seller_billing_payments.metadata because review state, reviewer identity, and
// rejection history are first-class financial operations and must remain queryable.
//
// VALIDATION BOUNDARY:
//   - Field-shape validation lives here (required strings, amount > 0, status set).
//   - Cross-table rules such as:
//       * payment.provider === "manual"
//       * invoice.status === "open"
//       * reported_amount / currency consistency
//     belong to the service layer where related rows can be loaded transactionally.

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type ManualPaymentReportStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

class SellerManualPaymentReport extends Model<
  InferAttributes<SellerManualPaymentReport>,
  InferCreationAttributes<SellerManualPaymentReport, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id: CreationOptional<number>;
  declare payment_id: number;
  declare seller_id: number;
  declare invoice_id: number;
  declare bank_name: string;
  declare deposit_reference: string;
  declare depositor_name: string;
  // DATEONLY -> string "YYYY-MM-DD" at runtime.
  declare deposit_date: string;
  // DECIMAL(12,2) — normalize with Number() in services before arithmetic.
  declare reported_amount: number;
  declare currency: string;
  declare receipt_file_url: string | null;
  declare notes: string | null;
  declare status: ManualPaymentReportStatus;
  declare reviewed_by: number | null;
  declare reviewed_at: Date | null;
  declare rejection_reason: string | null;
  declare metadata: object | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

SellerManualPaymentReport.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bank_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    deposit_reference: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    depositor_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    deposit_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    reported_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0.01,
      },
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      validate: {
        len: [3, 3],
        notEmpty: true,
      },
    },
    receipt_file_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "submitted",
      validate: {
        isIn: [["submitted", "under_review", "approved", "rejected"]],
      },
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: "seller_manual_payment_reports",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["payment_id"] },
      { fields: ["seller_id", "status"] },
      { fields: ["invoice_id"] },
      { fields: ["status", "created_at"] },
    ],
  },
);

export default SellerManualPaymentReport;
