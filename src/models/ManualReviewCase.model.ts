// src/models/ManualReviewCase.model.ts

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";
import type { CaseStatus, CasePriority } from "../config/financialPolicies";

class ManualReviewCase extends Model<
  InferAttributes<ManualReviewCase>,
  InferCreationAttributes<ManualReviewCase, { omit: "id" | "created_at" }>
> {
  declare id:                          CreationOptional<number>;
  declare case_type:                   string;
  declare subject_type:                string;
  declare subject_key:                 string;
  declare related_order_id:            number | null;
  declare related_payment_attempt_id:  number | null;
  declare priority:                    CasePriority;
  declare status:                      CaseStatus;
  declare reason:                      string;
  declare metadata:                    object | null;
  declare assigned_to:                 number | null;   // admin user id
  declare created_at:                  CreationOptional<Date>;
  declare resolved_at:                 Date | null;
}

ManualReviewCase.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    case_type: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    subject_type: {
      type:      DataTypes.STRING(20),
      allowNull: false,
    },
    subject_key: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    related_order_id: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    related_payment_attempt_id: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    priority: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "medium",
      validate: {
        isIn: [["low", "medium", "high", "critical"]],
      },
    },
    status: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "open",
      validate: {
        isIn: [["open", "in_review", "approved", "rejected", "escalated"]],
      },
    },
    reason: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type:      DataTypes.JSONB,
      allowNull: true,
    },
    assigned_to: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    resolved_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName:  "manual_review_cases",
    timestamps: false,
    indexes: [
      { fields: ["subject_type", "subject_key"] },
      { fields: ["status"] },
      { fields: ["priority"] },
      { fields: ["case_type"] },
      { fields: ["related_order_id"] },
      { fields: ["created_at"] },
    ],
  }
);

export default ManualReviewCase;
