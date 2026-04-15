// src/models/PolicyVersion.model.ts
//
// Source-of-truth registry for every policy version ever published.
// New version = new row. Operational fields (is_active / summaries) may be
// updated by privileged publishing flows when a draft is activated.

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
  InferCreationAttributes<
    PolicyVersion,
    { omit: "id" | "created_at" | "updated_at" }
  >
> {
  declare id:                     CreationOptional<string>;
  declare policy_type:            PolicyType;
  declare version_code:           string;
  declare version_label:          string;
  declare url:                    string | null;
  declare content_hash:           string;
  declare effective_at:           Date;
  declare is_active:              boolean;
  declare is_material:            boolean;
  declare requires_reacceptance:  boolean;
  declare change_summary_short:   string | null;
  declare change_summary_full:    string | null;
  declare created_at:             CreationOptional<Date>;
  declare updated_at:             CreationOptional<Date>;
}

// ── Init ──────────────────────────────────────────────────────────────────────

PolicyVersion.init(
  {
    id: {
      type:         DataTypes.UUID,
      primaryKey:   true,
      allowNull:    false,
      defaultValue: DataTypes.UUIDV4,
    },
    policy_type: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    version_code: {
      type:      DataTypes.STRING(32),
      allowNull: false,
    },
    version_label: {
      type:      DataTypes.STRING(200),
      allowNull: false,
    },
    url: {
      type:      DataTypes.STRING(500),
      allowNull: true,
    },
    content_hash: {
      type:      DataTypes.STRING(64),
      allowNull: false,
    },
    effective_at: {
      type:      DataTypes.DATE,
      allowNull: false,
    },
    is_active: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    is_material: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    requires_reacceptance: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    change_summary_short: {
      type:      DataTypes.STRING(500),
      allowNull: true,
    },
    change_summary_full: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      allowNull:    false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type:         DataTypes.DATE,
      allowNull:    false,
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
