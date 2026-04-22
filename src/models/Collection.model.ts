import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export class Collection extends Model<
  InferAttributes<Collection>,
  InferCreationAttributes<Collection, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id: CreationOptional<number>;
  declare seller_id: number;          // references users(id)
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare promo_image_url: CreationOptional<string | null>;
  declare background_color: CreationOptional<string>;
  declare background_image_url: CreationOptional<string | null>;
  declare canvas_width: CreationOptional<number>;
  declare canvas_height: CreationOptional<number>;
  declare status: "draft" | "published";
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

Collection.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    promo_image_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    background_color: {
      type: DataTypes.STRING(20),
      defaultValue: "#FFFFFF",
    },
    background_image_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    canvas_width: {
      type: DataTypes.INTEGER,
      defaultValue: 800,
    },
    canvas_height: {
      type: DataTypes.INTEGER,
      defaultValue: 600,
    },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      defaultValue: "draft",
    },
    created_at: { type: DataTypes.DATE },
    updated_at: { type: DataTypes.DATE },
  },
  {
    sequelize,
    tableName: "collections",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["seller_id"] },
      { fields: ["status"] },
    ],
  }
);

export default Collection;
