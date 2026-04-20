import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type WhatsappUnlinkedAttemptReason =
  | "profile_phone_match_unlinked"
  | "profile_phone_match_link_token_pending"
  | "unknown_phone";

class WhatsappUnlinkedSellerAttempt extends Model<
  InferAttributes<WhatsappUnlinkedSellerAttempt>,
  InferCreationAttributes<
    WhatsappUnlinkedSellerAttempt,
    { omit: "id" | "created_at" | "updated_at" }
  >
> {
  declare id: CreationOptional<string>;
  declare session_id: string | null;
  declare seller_user_id: number | null;
  declare phone_e164: string;
  declare wa_message_id: string;
  declare message_type: string;
  declare message_preview: string | null;
  declare reason: WhatsappUnlinkedAttemptReason;
  declare metadata: object | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

WhatsappUnlinkedSellerAttempt.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    seller_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    phone_e164: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    wa_message_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    message_preview: {
      type: DataTypes.STRING(280),
      allowNull: true,
    },
    reason: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [[
          "profile_phone_match_unlinked",
          "profile_phone_match_link_token_pending",
          "unknown_phone",
        ]],
      },
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
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "whatsapp_unlinked_seller_attempts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["seller_user_id"], name: "idx_wa_unlinked_attempts_seller" },
      { fields: ["phone_e164"], name: "idx_wa_unlinked_attempts_phone" },
      { fields: ["reason"], name: "idx_wa_unlinked_attempts_reason" },
      { fields: ["created_at"], name: "idx_wa_unlinked_attempts_created_at" },
      { fields: ["wa_message_id"], unique: true, name: "uq_wa_unlinked_attempts_message" },
    ],
  }
);

export default WhatsappUnlinkedSellerAttempt;
