// src/models/PaymentAttempt.model.ts

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type PaymentAttemptStatus =
  | "created"
  | "pending"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "ignored"
  | "manual_review";

class PaymentAttempt extends Model<
  InferAttributes<PaymentAttempt>,
  InferCreationAttributes<PaymentAttempt, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:                 CreationOptional<number>;
  declare order_id:           number;
  declare provider:           string;
  declare provider_intent_id: string | null;    // external payment intent ID
  declare provider_session_id: string | null;   // provider session / checkout session ID
  declare idempotency_key:    string;           // globally unique per attempt
  declare amount_expected:    number;           // server-set from order.total_amount
  declare currency:           string;
  declare status:             PaymentAttemptStatus;
  declare failure_reason:     string | null;
  declare metadata:           object | null;
  declare created_at:         CreationOptional<Date>;
  declare updated_at:         CreationOptional<Date>;
}

PaymentAttempt.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    order_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    provider: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    provider_intent_id: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    provider_session_id: {
      type:      DataTypes.STRING(255),
      allowNull: true,
    },
    idempotency_key: {
      type:      DataTypes.STRING(255),
      allowNull: false,
      unique:    true,
    },
    amount_expected: {
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
      defaultValue: "created",
      validate: {
        isIn: [["created", "pending", "confirmed", "failed", "cancelled", "ignored", "manual_review"]],
      },
    },
    failure_reason: {
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
    tableName:  "payment_attempts",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["order_id"] },
      { fields: ["idempotency_key"], unique: true },
      { fields: ["provider", "provider_intent_id"] },
      { fields: ["status"] },
    ],
  }
);

export default PaymentAttempt;
