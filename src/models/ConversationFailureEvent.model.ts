import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";
import type { ConversationEventSignal } from "../services/conversations/conversationFailureDetector.service";

class ConversationFailureEvent extends Model<
  InferAttributes<ConversationFailureEvent>,
  InferCreationAttributes<
    ConversationFailureEvent,
    { omit: "id" | "created_at" }
  >
> {
  declare id: CreationOptional<string>;
  declare session_id: string;
  declare seller_user_id: number | null;
  declare wa_message_id: string | null;
  declare signal: ConversationEventSignal;
  declare user_text: string | null;
  declare bot_text: string | null;
  declare current_step: string | null;
  declare expected_input_type: string | null;
  declare command_context: object | null;
  declare metadata: object | null;
  declare created_at: CreationOptional<Date>;
}

ConversationFailureEvent.init(
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
    seller_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    wa_message_id: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    signal: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    user_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    bot_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    current_step: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expected_input_type: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    command_context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "conversation_failure_events",
    timestamps: false,
    indexes: [
      { fields: ["session_id"], name: "idx_conv_failure_events_session" },
      { fields: ["signal"], name: "idx_conv_failure_events_signal" },
      { fields: ["created_at"], name: "idx_conv_failure_events_created_at" },
      { fields: ["seller_user_id"], name: "idx_conv_failure_events_seller" },
    ],
  }
);

export default ConversationFailureEvent;
