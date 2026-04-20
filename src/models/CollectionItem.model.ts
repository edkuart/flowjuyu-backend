import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export class CollectionItem extends Model<
  InferAttributes<CollectionItem>,
  InferCreationAttributes<CollectionItem, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id: CreationOptional<number>;
  declare collection_id: number;
  declare product_id: string;   // UUID
  declare pos_x: number;
  declare pos_y: number;
  declare width: number;
  declare height: number;
  declare z_index: CreationOptional<number>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

CollectionItem.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    collection_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    pos_x: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    pos_y: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    width: {
      type: DataTypes.FLOAT,
      defaultValue: 150,
    },
    height: {
      type: DataTypes.FLOAT,
      defaultValue: 150,
    },
    z_index: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    created_at: { type: DataTypes.DATE },
    updated_at: { type: DataTypes.DATE },
  },
  {
    sequelize,
    tableName: "collection_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["collection_id"] },
      { fields: ["product_id"] },
    ],
  }
);

export default CollectionItem;
