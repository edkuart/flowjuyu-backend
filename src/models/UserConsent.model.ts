// src/models/UserConsent.model.ts
//
// Append-only audit log of every consent action a user has ever taken.
// Rows are NEVER updated or deleted.
//   granted = true  → user accepted the policy version
//   granted = false → user revoked / withdrew consent

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConsentSource =
  | "registration_buyer"
  | "registration_seller"
  | "registration_social"
  | "settings_page"
  | "import"
  | "admin";

// ── Model ─────────────────────────────────────────────────────────────────────

class UserConsent extends Model<
  InferAttributes<UserConsent>,
  InferCreationAttributes<UserConsent, { omit: "id" | "created_at" }>
> {
  // BIGINT → Sequelize returns it as string in JS to avoid 64-bit precision loss
  declare id:                CreationOptional<string>;
  declare user_id:           number;
  declare policy_version_id: number;
  declare granted:           boolean;
  declare ip_address:        string | null;
  declare user_agent:        string | null;
  declare source:            ConsentSource | string | null;
  declare created_at:        CreationOptional<Date>;
}

// ── Init ──────────────────────────────────────────────────────────────────────

UserConsent.init(
  {
    id: {
      type:          DataTypes.BIGINT,
      primaryKey:    true,
      autoIncrement: true,
    },
    user_id: {
      type:       DataTypes.INTEGER,
      allowNull:  false,
      references: { model: "users", key: "id" },
      onDelete:   "CASCADE",
      onUpdate:   "CASCADE",
    },
    policy_version_id: {
      type:       DataTypes.INTEGER,
      allowNull:  false,
      references: { model: "policy_versions", key: "id" },
      onDelete:   "RESTRICT",
      onUpdate:   "CASCADE",
    },
    granted: {
      type:      DataTypes.BOOLEAN,
      allowNull: false,
    },
    ip_address: {
      type:      DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type:      DataTypes.STRING(50),
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "user_consents",
    timestamps: false,
  },
);

export default UserConsent;
