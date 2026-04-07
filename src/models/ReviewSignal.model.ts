import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class ReviewSignal extends Model<
  InferAttributes<ReviewSignal>,
  InferCreationAttributes<ReviewSignal, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id:            CreationOptional<number>;
  declare review_id:     string;
  declare risk_score:    number;
  declare trust_score:   number;
  declare quality_score: number;
  declare signals:       object;
  declare created_at:    CreationOptional<Date>;
  declare updated_at:    CreationOptional<Date>;
}

ReviewSignal.init(
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
    risk_score: {
      type:      DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0,
    },
    trust_score: {
      type:      DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0,
    },
    quality_score: {
      type:      DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0,
    },
    signals: {
      type:      DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
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
    tableName:  "review_signals",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    indexes: [
      { unique: true, fields: ["review_id"] },
      { fields: ["risk_score"] },
      { fields: ["trust_score"] },
      { fields: ["quality_score"] },
    ],
  }
);

export default ReviewSignal;
