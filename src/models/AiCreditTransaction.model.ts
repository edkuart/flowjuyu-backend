// src/models/AiCreditTransaction.model.ts

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type AiCreditTransactionType =
  | "purchase"
  | "debit"
  | "refund"
  | "manual_grant"
  | "plan_renewal";

class AiCreditTransaction extends Model<
  InferAttributes<AiCreditTransaction>,
  InferCreationAttributes<AiCreditTransaction, { omit: "id" | "created_at" }>
> {
  declare id: CreationOptional<string>;
  declare seller_id: number;
  declare type: AiCreditTransactionType;
  declare credits: number; // positive = add, negative = deduct
  declare balance_before: number | null;
  declare balance_after: number;
  declare description: string;
  declare ref_type: string | null; // 'content_generation' | 'video_generation' | 'canvas_ai' | 'purchase_request'
  declare ref_id: string | null;
  declare created_at: CreationOptional<Date>;
}

AiCreditTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["purchase", "debit", "refund", "manual_grant", "plan_renewal"]],
      },
    },
    credits: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    balance_before: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    balance_after: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ref_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    ref_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    tableName: "ai_credit_transactions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [
      { fields: ["seller_id", "created_at"] },
      { fields: ["ref_type", "ref_id"] },
    ],
  },
);

export default AiCreditTransaction;
