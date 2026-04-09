import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class WhatsappLinkingToken extends Model<
  InferAttributes<WhatsappLinkingToken>,
  InferCreationAttributes<
    WhatsappLinkingToken,
    { omit: "id" | "created_at" | "updated_at" | "used_at" | "invalidated_at" }
  >
> {
  declare id: CreationOptional<string>;
  declare seller_user_id: number;
  declare token_hash: string;
  declare token_hint: string;
  declare expires_at: Date;
  declare used_at: Date | null;
  declare used_by_phone_e164: string | null;
  declare invalidated_at: Date | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

WhatsappLinkingToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    seller_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    token_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    token_hint: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    used_by_phone_e164: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    invalidated_at: {
      type: DataTypes.DATE,
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
    tableName: "whatsapp_linking_tokens",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["seller_user_id"], name: "idx_whatsapp_linking_tokens_seller" },
      { fields: ["token_hash"], unique: true, name: "uq_whatsapp_linking_tokens_hash" },
      { fields: ["expires_at"], name: "idx_whatsapp_linking_tokens_expires_at" },
    ],
  }
);

export default WhatsappLinkingToken;
