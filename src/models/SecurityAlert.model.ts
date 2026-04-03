// src/models/SecurityAlert.model.ts

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type AlertStatus   = "open" | "acknowledged" | "resolved";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

class SecurityAlert extends Model<
  InferAttributes<SecurityAlert>,
  InferCreationAttributes<SecurityAlert, { omit: "id" | "created_at" | "resolved_at" }>
> {
  declare id:           CreationOptional<number>;
  declare type:         string;
  declare severity:     AlertSeverity;
  declare subject_type: string;        // "user", "ip", "admin"
  declare subject_key:  string;        // userId string or IP address
  declare status:       AlertStatus;
  declare title:        string;
  declare description:  string;
  declare metadata:     object | null;
  declare created_at:   CreationOptional<Date>;
  declare resolved_at:  Date | null;
}

SecurityAlert.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    type: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    severity: {
      type:      DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["low", "medium", "high", "critical"]],
      },
    },
    subject_type: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    subject_key: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "open",
      validate: {
        isIn: [["open", "acknowledged", "resolved"]],
      },
    },
    title: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type:      DataTypes.JSONB,
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
    tableName:  "security_alerts",
    timestamps: false,
    indexes: [
      { fields: ["status"] },
      { fields: ["severity"] },
      { fields: ["type"] },
      { fields: ["subject_type", "subject_key"] },
      { fields: ["created_at"] },
    ],
  }
);

export default SecurityAlert;
