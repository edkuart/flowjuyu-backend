// src/models/ProcessedWebhook.model.ts
//
// Idempotency table for webhook events.
// Every inbound webhook is recorded here BEFORE processing.
// Duplicate events are detected by (provider, webhook_event_id).

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export type WebhookStatus = "processed" | "failed" | "ignored";

class ProcessedWebhook extends Model<
  InferAttributes<ProcessedWebhook>,
  InferCreationAttributes<ProcessedWebhook, { omit: "id" | "created_at" }>
> {
  declare id:               CreationOptional<number>;
  declare provider:         string;
  declare webhook_event_id: string;   // provider's unique event ID
  declare event_type:       string;
  declare payload_hash:     string;   // SHA-256 of raw body for audit/forensics
  declare status:           WebhookStatus;
  declare processed_at:     Date | null;
  declare created_at:       CreationOptional<Date>;
}

ProcessedWebhook.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    provider: {
      type:      DataTypes.STRING(50),
      allowNull: false,
    },
    webhook_event_id: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    event_type: {
      type:      DataTypes.STRING(100),
      allowNull: false,
    },
    payload_hash: {
      type:      DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type:      DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["processed", "failed", "ignored"]],
      },
    },
    processed_at: {
      type:      DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "processed_webhooks",
    timestamps: false,
    indexes: [
      { fields: ["provider", "webhook_event_id"], unique: true, name: "idx_pwh_provider_event_id" },
      { fields: ["event_type"] },
      { fields: ["status"] },
      { fields: ["created_at"] },
    ],
  }
);

export default ProcessedWebhook;
