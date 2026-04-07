// src/models/SellerBillingPayment.model.ts
//
// Records every payment attempt for a seller invoice. A single invoice can have
// multiple payment attempts (link expired, retried with different provider, etc.).
//
// STATUS MACHINE:
//   pending        → processing       (webhook received, verifying)
//   pending        → confirmed        (provider confirms payment)
//   pending        → failed           (provider rejects)
//   pending        → cancelled        (seller cancels before paying)
//   pending        → expired          (cron: provider_link_expires_at passed)
//   pending        → manual_pending   (seller reports manual payment / uploads receipt)
//   manual_pending → confirmed        (admin verifies receipt)
//   manual_pending → failed           (admin rejects receipt)
//   processing     → confirmed | failed
//
// IDEMPOTENCY:
//   idempotency_key is nullable. When non-null, it is UNIQUE in DB.
//   PostgreSQL UNIQUE on a nullable column allows multiple NULLs (NULL ≠ NULL).
//   Key is ALWAYS generated server-side — never accepted from the frontend.
//
// WEBHOOK LOOKUP:
//   The composite index (provider, provider_reference) is the critical O(1) lookup
//   path when an inbound webhook arrives. provider_reference = the provider's external ID.
//
// AMOUNTS:
//   amount is DECIMAL(12,2). Sequelize returns it as string at runtime.
//   Always use Number(payment.amount) when doing arithmetic.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type BillingProvider      = "bac" | "paypal" | "manual";
export type BillingPaymentStatus =
  | "pending"
  | "processing"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "expired"
  | "manual_pending";

class SellerBillingPayment extends Model<
  InferAttributes<SellerBillingPayment>,
  InferCreationAttributes<SellerBillingPayment, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:                       CreationOptional<number>;
  declare invoice_id:               number;
  // Denormalized — avoids joining through invoice to get seller_id in webhook path.
  declare seller_id:                number;
  declare provider:                 BillingProvider;
  declare provider_reference:       string | null;
  declare provider_link:            string | null;
  declare provider_link_expires_at: Date | null;
  declare amount:                   number;
  declare currency:                 string;
  declare status:                   BillingPaymentStatus;
  // e.g. "Visa *4242" — never a full card number or CVV.
  declare payment_method_detail:    string | null;
  declare confirmed_at:             Date | null;
  // FK to users — admin who confirmed a manual payment. SET NULL on user delete.
  declare confirmed_by:             number | null;
  declare failure_reason:           string | null;
  declare notes:                    string | null;
  declare idempotency_key:          string | null;
  declare metadata:                 object | null;
  declare created_at:               CreationOptional<Date>;
  declare updated_at:               CreationOptional<Date>;
}

SellerBillingPayment.init(
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
    seller_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    provider: {
      type:      DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [["bac", "paypal", "manual"]],
      },
    },
    provider_reference: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    provider_link: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    provider_link_expires_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    currency: {
      type:      DataTypes.STRING(3),
      allowNull: false,
    },
    status: {
      type:         DataTypes.STRING(30),
      allowNull:    false,
      defaultValue: "pending",
      validate: {
        isIn: [["pending", "processing", "confirmed", "failed", "cancelled", "expired", "manual_pending"]],
      },
    },
    payment_method_detail: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    confirmed_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    confirmed_by: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    failure_reason: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    idempotency_key: {
      type:      DataTypes.STRING(255),
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
    tableName:  "seller_billing_payments",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["idempotency_key"],             unique: true },
      { fields: ["provider", "provider_reference"] },
      { fields: ["seller_id", "status"] },
      { fields: ["invoice_id"] },
      { fields: ["status", "provider_link_expires_at"] },
    ],
  },
);

export default SellerBillingPayment;
