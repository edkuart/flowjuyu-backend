import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";
import type {
  ConversationStep,
  ExpectedInputType,
} from "../services/conversations/conversationState";

export type ConversationChannel = "whatsapp";
export type ConversationSessionStatus = "active" | "blocked" | "closed";

const CONVERSATION_STEPS: ConversationStep[] = [
  "awaiting_image",
  "awaiting_details",
  "awaiting_measures",
  "awaiting_price",
  "awaiting_stock",
  "awaiting_category",
  "awaiting_class",
  "preview",
  "awaiting_confirmation",
  "published",
];

const EXPECTED_INPUT_TYPES: ExpectedInputType[] = [
  "image",
  "text",
  "price",
  "number",
  "category",
];

class ConversationSession extends Model<
  InferAttributes<ConversationSession>,
  InferCreationAttributes<ConversationSession, {
    omit:
      | "id"
      | "created_at"
      | "updated_at"
      | "last_activity_at"
      | "pending_confirmation_json"
      | "command_context_json"
      | "failure_score"
      | "frustration_score"
      | "safe_mode"
  }>
> {
  declare id: CreationOptional<string>;
  declare phone_e164: string;
  declare channel: ConversationChannel;
  declare linked_seller_user_id: number | null;
  declare current_step: ConversationStep;
  declare expected_input_type: ExpectedInputType | null;
  declare pending_confirmation_json: object | null;
  declare command_context_json: object | null;
  declare status: ConversationSessionStatus;
  /** Composite failure score (0–100). Driven by failure signal increments, decays on success. */
  declare failure_score: CreationOptional<number>;
  /** Frustration-specific sub-score (0–100). Driven by user frustration signals. */
  declare frustration_score: CreationOptional<number>;
  /** When true: bot restricts to guided interactions only. Entered at CRITICAL risk. */
  declare safe_mode: CreationOptional<boolean>;
  declare last_activity_at: CreationOptional<Date>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

ConversationSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phone_e164: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "whatsapp",
      validate: {
        isIn: [["whatsapp"]],
      },
    },
    linked_seller_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    current_step: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "awaiting_image",
      validate: {
        isIn: [CONVERSATION_STEPS],
      },
    },
    expected_input_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [EXPECTED_INPUT_TYPES],
      },
    },
    pending_confirmation_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    command_context_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "active",
      validate: {
        isIn: [["active", "blocked", "closed"]],
      },
    },
    failure_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    frustration_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    safe_mode: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    last_activity_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    tableName: "conversation_sessions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["channel", "phone_e164"], unique: true, name: "uq_conversation_sessions_channel_phone" },
      { fields: ["status"], name: "idx_conversation_sessions_status" },
      { fields: ["linked_seller_user_id"], name: "idx_conversation_sessions_seller" },
      { fields: ["last_activity_at"], name: "idx_conversation_sessions_last_activity" },
      { fields: ["safe_mode"], name: "idx_conversation_sessions_safe_mode" },
    ],
  }
);

export default ConversationSession;
