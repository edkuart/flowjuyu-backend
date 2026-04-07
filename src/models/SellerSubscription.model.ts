// src/models/SellerSubscription.model.ts
//
// The active or historical contract between a seller and the platform.
//
// STATUS MACHINE:
//   draft      → active          (first payment confirmed)
//   active     → past_due        (cron: period ended, auto_renew=true, no renewal payment)
//   active     → expired         (cron: period ended, auto_renew=false)
//   active     → cancelled       (seller or admin cancels)
//   past_due   → active          (renewal payment confirmed within grace period)
//   past_due   → expired         (cron: grace_period_end passed without payment)
//   expired    → active          (reactivation: new payment on a new or same plan)
//   active     → paused          (admin action)
//   past_due   → paused          (admin action)
//   paused     → active          (admin resumes)
//
// PERIOD FIELDS (current_period_*, grace_period_end):
//   - DataTypes.DATEONLY → stored as PostgreSQL DATE (no time component).
//   - Sequelize returns DATEONLY values as string "YYYY-MM-DD", NOT as Date objects.
//   - Declare as `string | null`, not `Date | null`.
//   - All comparisons should happen in SQL (WHERE current_period_end <= CURRENT_DATE)
//     to avoid timezone issues at the JavaScript layer.
//
// IDEMPOTENCY:
//   last_payment_id is set when a payment is confirmed and activateSubscription()
//   runs. On a duplicate webhook, the service checks:
//     if (sub.last_payment_id === incomingPaymentId) return { alreadyActivated: true }
//   This prevents double-activation without requiring a separate dedup table.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type SubscriptionStatus =
  | "draft"
  | "active"
  | "past_due"
  | "expired"
  | "cancelled"
  | "paused";

export type BillingCycle = "monthly" | "yearly";

class SellerSubscription extends Model<
  InferAttributes<SellerSubscription>,
  InferCreationAttributes<SellerSubscription, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:                   CreationOptional<number>;
  declare seller_id:            number;
  declare plan_id:              number;
  declare status:               SubscriptionStatus;
  declare billing_cycle:        BillingCycle;
  // Price locked at signup. Never reflects plan.price_monthly changes after the fact.
  declare price_at_signup:      number;
  declare currency_at_signup:   string;
  // DATEONLY → string "YYYY-MM-DD" at runtime. null while status = "draft".
  declare current_period_start: string | null;
  declare current_period_end:   string | null;
  declare grace_period_end:     string | null;
  declare auto_renew:           boolean;
  declare cancelled_at:         Date | null;
  declare cancellation_reason:  string | null;
  declare paused_at:            Date | null;
  declare paused_by:            number | null;
  declare resumed_at:           Date | null;
  // FK to seller_billing_payments — added by migration 000007 (circular FK resolution).
  declare last_payment_id:      number | null;
  declare metadata:             object | null;
  declare created_at:           CreationOptional<Date>;
  declare updated_at:           CreationOptional<Date>;
}

SellerSubscription.init(
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
    plan_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type:         DataTypes.STRING(30),
      allowNull:    false,
      defaultValue: "draft",
      validate: {
        isIn: [["draft", "active", "past_due", "expired", "cancelled", "paused"]],
      },
    },
    billing_cycle: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "monthly",
      validate: {
        isIn: [["monthly", "yearly"]],
      },
    },
    price_at_signup: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    currency_at_signup: {
      type:         DataTypes.STRING(3),
      allowNull:    false,
      defaultValue: "GTQ",
    },
    current_period_start: {
      type:      DataTypes.DATEONLY,
      allowNull: true,
    },
    current_period_end: {
      type:      DataTypes.DATEONLY,
      allowNull: true,
    },
    grace_period_end: {
      type:      DataTypes.DATEONLY,
      allowNull: true,
    },
    auto_renew: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    cancelled_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    cancellation_reason: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    paused_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    paused_by: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    resumed_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    last_payment_id: {
      type:      DataTypes.INTEGER,
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
    tableName:  "seller_subscriptions",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["seller_id", "status"] },
      { fields: ["status", "current_period_end"] },
      { fields: ["status", "grace_period_end"] },
      { fields: ["seller_id", "created_at"] },
      { fields: ["last_payment_id"] },
      // Partial unique index (idx_ss_one_active_per_seller) is created via raw SQL
      // in migration 000003 — cannot be expressed in Sequelize model indexes.
    ],
  },
);

export default SellerSubscription;
