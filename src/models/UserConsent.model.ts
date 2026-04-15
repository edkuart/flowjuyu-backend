// src/models/UserConsent.model.ts
//
// Append-only evidence log of every consent action a user has ever taken.
// Rows are NEVER updated or deleted.

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
  declare id:                CreationOptional<string>;
  declare user_id:           number;
  declare policy_type:       string;
  declare policy_version_id: string;
  declare accepted:          boolean;
  declare accepted_at:       Date;
  declare surface:           string | null;
  declare locale:            string | null;
  declare user_agent:        string | null;
  declare ip_hash:           string | null;
  declare evidence_json:     Record<string, unknown> | null;
  declare created_at:        CreationOptional<Date>;
}

// ── Init ──────────────────────────────────────────────────────────────────────

UserConsent.init(
  {
    id: {
      type:         DataTypes.UUID,
      primaryKey:   true,
      allowNull:    false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type:       DataTypes.INTEGER,
      allowNull:  false,
      references: { model: "users", key: "id" },
      onDelete:   "CASCADE",
      onUpdate:   "CASCADE",
    },
    policy_type: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    policy_version_id: {
      type:       DataTypes.UUID,
      allowNull:  false,
      references: { model: "policy_versions", key: "id" },
      onDelete:   "RESTRICT",
      onUpdate:   "CASCADE",
    },
    accepted: {
      type:      DataTypes.BOOLEAN,
      allowNull: false,
    },
    accepted_at: {
      type:      DataTypes.DATE,
      allowNull: false,
    },
    surface: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    locale: {
      type:      DataTypes.STRING(16),
      allowNull: true,
    },
    user_agent: {
      type:      DataTypes.TEXT,
      allowNull: true,
    },
    ip_hash: {
      type:      DataTypes.STRING(128),
      allowNull: true,
    },
    evidence_json: {
      type:      DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      allowNull:    false,
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
