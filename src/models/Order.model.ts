// src/models/Order.model.ts

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "manual_review"
  | "paid"
  | "payment_failed"
  | "cancelled"
  | "fulfilled"
  | "completed"
  | "refunded";

export type OrderReviewStatus = "not_required" | "pending" | "approved" | "rejected";

class Order extends Model<
  InferAttributes<Order>,
  InferCreationAttributes<Order, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:              CreationOptional<number>;
  declare buyer_id:        number;
  declare seller_id:       number;
  declare status:          OrderStatus;
  declare currency:        string;
  declare subtotal_amount: number;
  declare fee_amount:      number;
  declare total_amount:    number;
  declare risk_level:      string | null;
  declare review_status:   OrderReviewStatus | null;
  declare created_at:      CreationOptional<Date>;
  declare updated_at:      CreationOptional<Date>;
}

Order.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    buyer_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    seller_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type:         DataTypes.STRING(30),
      allowNull:    false,
      defaultValue: "draft",
      validate: {
        isIn: [[
          "draft", "pending_payment", "manual_review", "paid",
          "payment_failed", "cancelled", "fulfilled", "completed", "refunded",
        ]],
      },
    },
    currency: {
      type:      DataTypes.STRING(3),
      allowNull: false,
    },
    subtotal_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    fee_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    total_amount: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    risk_level: {
      type:      DataTypes.STRING(20),
      allowNull: true,
    },
    review_status: {
      type:      DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [["not_required", "pending", "approved", "rejected"]],
      },
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
    tableName:  "orders",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["buyer_id"] },
      { fields: ["seller_id"] },
      { fields: ["status"] },
      { fields: ["created_at"] },
    ],
  }
);

export default Order;
