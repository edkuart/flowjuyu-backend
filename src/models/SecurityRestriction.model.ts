// src/models/SecurityRestriction.model.ts

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type RestrictionSubjectType = "user" | "ip" | "seller" | "admin";
export type RestrictionType =
  | "login_cooldown"
  | "review_block"
  | "kyc_block"
  | "manual_review_required";
export type RestrictionStatus = "active" | "expired" | "revoked";

class SecurityRestriction extends Model<
  InferAttributes<SecurityRestriction>,
  InferCreationAttributes<SecurityRestriction, { omit: "id" | "created_at" }>
> {
  declare id:               CreationOptional<number>;
  declare subject_type:     RestrictionSubjectType;
  declare subject_key:      string;
  declare restriction_type: RestrictionType;
  declare reason:           string;
  declare status:           RestrictionStatus;
  declare expires_at:       Date | null;
  declare metadata:         object | null;
  declare created_at:       CreationOptional<Date>;
}

SecurityRestriction.init(
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
        isIn: [["user", "ip", "seller", "admin"]],
      },
    },
    subject_key: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    restriction_type: {
      type:      DataTypes.STRING(40),
      allowNull: false,
      validate: {
        isIn: [[
          "login_cooldown",
          "review_block",
          "kyc_block",
          "manual_review_required",
        ]],
      },
    },
    reason: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "active",
      validate: {
        isIn: [["active", "expired", "revoked"]],
      },
    },
    expires_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type:      DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "security_restrictions",
    timestamps: false,
    indexes: [
      { fields: ["subject_type", "subject_key", "status"] },
      { fields: ["restriction_type"] },
      { fields: ["expires_at"] },
      { fields: ["created_at"] },
    ],
  }
);

export default SecurityRestriction;

