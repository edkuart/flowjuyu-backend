import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type ConversationMessageDirection = "inbound" | "outbound";
export type ConversationMessageType = "text" | "image" | "audio";
export type ConversationMessageStatus = "received" | "processed" | "ignored" | "sent" | "failed";

class ConversationMessage extends Model<
  InferAttributes<ConversationMessage>,
  InferCreationAttributes<ConversationMessage, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id: CreationOptional<string>;
  declare session_id: string;
  declare channel: string;
  declare direction: ConversationMessageDirection;
  declare message_type: ConversationMessageType;
  declare content_text: string | null;
  declare media_id: string | null;
  declare mime_type: string | null;
  declare wa_message_id: string | null;
  declare status: ConversationMessageStatus;
  declare raw_payload: object | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

ConversationMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "whatsapp",
    },
    direction: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["inbound", "outbound"]],
      },
    },
    message_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["text", "image", "audio"]],
      },
    },
    content_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    media_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    wa_message_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "received",
      validate: {
        isIn: [["received", "processed", "ignored", "sent", "failed"]],
      },
    },
    raw_payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "conversation_messages",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["session_id"], name: "idx_conversation_messages_session" },
      { fields: ["channel", "wa_message_id"], unique: true, name: "uq_conversation_messages_channel_wa" },
      { fields: ["direction", "status"], name: "idx_conversation_messages_direction_status" },
      { fields: ["created_at"], name: "idx_conversation_messages_created_at" },
    ],
  }
);

export default ConversationMessage;
