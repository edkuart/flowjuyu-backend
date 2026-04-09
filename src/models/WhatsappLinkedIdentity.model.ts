import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type WhatsappLinkedIdentityStatus = "active" | "revoked";

class WhatsappLinkedIdentity extends Model<
  InferAttributes<WhatsappLinkedIdentity>,
  InferCreationAttributes<
    WhatsappLinkedIdentity,
    { omit: "id" | "created_at" | "updated_at" | "linked_at" | "revoked_at" }
  >
> {
  declare id: CreationOptional<string>;
  declare seller_user_id: number;
  declare channel: "whatsapp";
  declare phone_e164: string;
  declare status: WhatsappLinkedIdentityStatus;
  declare linked_via_token_id: string | null;
  declare linked_at: CreationOptional<Date>;
  declare revoked_at: Date | null;
  declare revoked_by_user_id: number | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

WhatsappLinkedIdentity.init(
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
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "whatsapp",
      validate: {
        isIn: [["whatsapp"]],
      },
    },
    phone_e164: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "active",
      validate: {
        isIn: [["active", "revoked"]],
      },
    },
    linked_via_token_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    linked_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revoked_by_user_id: {
      type: DataTypes.INTEGER,
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
    tableName: "whatsapp_linked_identities",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["seller_user_id"], name: "idx_whatsapp_linked_identities_seller" },
      { fields: ["phone_e164"], name: "idx_whatsapp_linked_identities_phone" },
      { fields: ["status"], name: "idx_whatsapp_linked_identities_status" },
    ],
  }
);

export default WhatsappLinkedIdentity;
