import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type ListingDraftStatus =
  | "collecting"
  | "ready_to_publish"
  | "publishing"
  | "published"
  | "cancelled";

class ListingDraft extends Model<
  InferAttributes<ListingDraft>,
  InferCreationAttributes<ListingDraft, { omit: "id" | "created_at" | "updated_at" | "images_json" | "vision_suggestions_json" }>
> {
  declare id: CreationOptional<string>;
  declare session_id: string;
  declare seller_user_id: number | null;
  declare images_json: object[];
  declare suggested_title: string | null;
  declare suggested_description: string | null;
  declare price: number | null;
  declare stock: number | null;
  declare measures_text: string | null;
  declare clase_id: number | null;
  declare categoria_id: number | null;
  declare categoria_custom: string | null;
  declare vision_suggestions_json: object | null;
  declare status: ListingDraftStatus;
  declare published_product_id: string | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

ListingDraft.init(
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
    images_json: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    suggested_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    suggested_description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    measures_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    clase_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    categoria_custom: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    vision_suggestions_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "collecting",
      validate: {
        isIn: [["collecting", "ready_to_publish", "publishing", "published", "cancelled"]],
      },
    },
    published_product_id: {
      type: DataTypes.UUID,
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
    tableName: "listing_drafts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["session_id"], unique: true, name: "uq_listing_drafts_session" },
      { fields: ["status"], name: "idx_listing_drafts_status" },
      { fields: ["seller_user_id"], name: "idx_listing_drafts_seller" },
      { fields: ["published_product_id"], name: "idx_listing_drafts_product" },
    ],
  }
);

export default ListingDraft;
