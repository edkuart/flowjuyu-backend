import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class ReviewResponse extends Model<
  InferAttributes<ReviewResponse>,
  InferCreationAttributes<ReviewResponse, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:         CreationOptional<number>;
  declare review_id:  string;
  declare seller_id:  number;
  declare respuesta:  string;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

ReviewResponse.init(
  {
    id: {
      type:          DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey:    true,
    },
    review_id: {
      type:      DataTypes.UUID,
      allowNull: false,
    },
    seller_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    respuesta: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
    },
    updated_at: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    tableName:  "review_responses",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { unique: true, fields: ["review_id"] },
      { fields: ["seller_id"] },
    ],
  }
);

export default ReviewResponse;
