import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class ReviewReport extends Model<
  InferAttributes<ReviewReport>,
  InferCreationAttributes<ReviewReport, { omit: "id" | "created_at" }>
> {
  declare id:         CreationOptional<number>;
  declare review_id:  string;
  declare user_id:    number;
  declare motivo:     string;
  declare created_at: CreationOptional<Date>;
}

ReviewReport.init(
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
    user_id: {
      type:      DataTypes.INTEGER,
      allowNull: false,
    },
    motivo: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "review_reports",
    timestamps: false,
    indexes: [
      { fields: ["review_id"] },
      { fields: ["user_id"] },
      { unique: true, fields: ["review_id", "user_id"] },
    ],
  }
);

export default ReviewReport;
