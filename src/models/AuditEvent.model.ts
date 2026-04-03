// src/models/AuditEvent.model.ts

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type AuditStatus   = "success" | "failed" | "blocked" | "denied";
export type AuditSeverity = "low" | "medium" | "high" | "critical";

class AuditEvent extends Model<
  InferAttributes<AuditEvent>,
  InferCreationAttributes<AuditEvent, { omit: "id" | "created_at" }>
> {
  declare id:             CreationOptional<number>;
  declare actor_user_id:  number | null;
  declare actor_role:     string;
  declare action:         string;
  declare entity_type:    string | null;
  declare entity_id:      string | null;
  declare target_user_id: number | null;
  declare ip_address:     string;
  declare user_agent:     string;
  declare http_method:    string;
  declare route:          string;
  declare status:         AuditStatus;
  declare severity:       AuditSeverity;
  declare metadata:       object | null;
  declare created_at:     CreationOptional<Date>;
}

AuditEvent.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    actor_user_id: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    actor_role: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    action: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    entity_type: {
      type:      DataTypes.STRING(50),
      allowNull: true,
    },
    entity_id: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    target_user_id: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
    ip_address: {
      type:      DataTypes.STRING(45), // covers IPv6
      allowNull: false,
      defaultValue: "unknown",
    },
    user_agent: {
      type:      DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    http_method: {
      type:      DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "",
    },
    route: {
      type:      DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
    },
    status: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      validate: {
        isIn: [["success", "failed", "blocked", "denied"]],
      },
    },
    severity: {
      type:      DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["low", "medium", "high", "critical"]],
      },
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
    tableName:  "audit_events",
    timestamps: false,
    indexes: [
      { fields: ["actor_user_id"] },
      { fields: ["action"] },
      { fields: ["status"] },
      { fields: ["severity"] },
      { fields: ["created_at"] },
    ],
  }
);

export default AuditEvent;
