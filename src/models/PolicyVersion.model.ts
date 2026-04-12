// src/models/PolicyVersion.model.ts
//
// Source-of-truth registry for every legal document version ever published.
// Rows are NEVER updated or deleted — new version = new row.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PolicyType =
  | "terms"
  | "privacy"
  | "communications"
  | "kyc_data";

// ── Model ─────────────────────────────────────────────────────────────────────

class PolicyVersion extends Model<
  InferAttributes<PolicyVersion>,
  InferCreationAttributes<PolicyVersion, { omit: "id" | "created_at" }>
> {
  declare id:             CreationOptional<number>;
  declare policy_type:    PolicyType;
  declare version:        string;
  declare label:          string;
  declare url:            string;
  declare content_hash:   string | null;
  declare effective_from: Date;
  declare is_active:      boolean;
  declare created_at:     CreationOptional<Date>;
}

// ── Init ──────────────────────────────────────────────────────────────────────

PolicyVersion.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      primaryKey:    true,
      autoIncrement: true,
    },
    policy_type: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    version: {
      type:      DataTypes.STRING(20),
      allowNull: false,
    },
    label: {
      type:      DataTypes.STRING(200),
      allowNull: false,
    },
    url: {
      type:      DataTypes.STRING(500),
      allowNull: false,
    },
    content_hash: {
      type:      DataTypes.STRING(64),
      allowNull: true,
    },
    effective_from: {
      type:      DataTypes.DATE,
      allowNull: false,
    },
    is_active: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "policy_versions",
    timestamps: false,
  },
);

export default PolicyVersion;
