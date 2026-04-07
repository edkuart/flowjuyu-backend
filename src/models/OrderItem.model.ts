// src/models/OrderItem.model.ts
//
// Immutable snapshot of a product at time of purchase.
// unit_price_snapshot and product_name_snapshot are NEVER updated after creation.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

class OrderItem extends Model<
  InferAttributes<OrderItem>,
  InferCreationAttributes<OrderItem, { omit: "id" | "created_at" }>
> {
  declare id:                    CreationOptional<number>;
  declare order_id:              number;
  declare product_id:            string | null;   // nullable for soft-deleted products
  declare product_name_snapshot: string;          // product name at purchase time
  declare unit_price_snapshot:   number;          // server-computed from DB, never frontend
  declare quantity:              number;
  declare line_total:            number;          // unit_price_snapshot * quantity
  declare metadata:              object | null;
  declare created_at:            CreationOptional<Date>;
}

OrderItem.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    order_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    product_id: {
      type:      DataTypes.STRING(100),
      allowNull: true,
    },
    product_name_snapshot: {
      type:      DataTypes.STRING(255),
      allowNull: false,
    },
    unit_price_snapshot: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    quantity: {
      type:      DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    line_total: {
      type:      DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    metadata: {
      type:      DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "order_items",
    timestamps: false,
    indexes: [
      { fields: ["order_id"] },
      { fields: ["product_id"] },
    ],
  }
);

export default OrderItem;
