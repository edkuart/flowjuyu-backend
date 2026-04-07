// src/models/SecurityProfile.model.ts
//
// One profile per (subject_type, subject_key) pair.
// Upserted each time the fraud intelligence service evaluates that subject.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";
import type { ProfileStatus } from "../config/financialPolicies";

class SecurityProfile extends Model<
  InferAttributes<SecurityProfile>,
  InferCreationAttributes<SecurityProfile, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:                    CreationOptional<number>;
  declare subject_type:          string;   // "user", "ip", "seller"
  declare subject_key:           string;   // userId string, IP, or sellerId string
  declare trust_score:           number;   // 0–100, higher = more trustworthy
  declare risk_score:            number;   // 0–100, higher = riskier
  declare financial_risk_score:  number;   // 0–100, payment/order specific
  declare status:                ProfileStatus;
  declare last_evaluated_at:     Date | null;
  declare metadata:              object | null;
  declare created_at:            CreationOptional<Date>;
  declare updated_at:            CreationOptional<Date>;
}

SecurityProfile.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    subject_type: {
      type:      DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["user", "ip", "seller"]],
      },
    },
    subject_key: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    trust_score: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 50,
      validate:     { min: 0, max: 100 },
    },
    risk_score: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
      validate:     { min: 0, max: 100 },
    },
    financial_risk_score: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
      validate:     { min: 0, max: 100 },
    },
    status: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "active",
      validate: {
        isIn: [["active", "flagged", "suspended", "cleared"]],
      },
    },
    last_evaluated_at: {
      type:      DataTypes.DATE,
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
    tableName:  "security_profiles",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { fields: ["subject_type", "subject_key"], unique: true, name: "idx_sp_subject" },
      { fields: ["status"] },
      { fields: ["financial_risk_score"] },
      { fields: ["last_evaluated_at"] },
    ],
  }
);

export default SecurityProfile;
