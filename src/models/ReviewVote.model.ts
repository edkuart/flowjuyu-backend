import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class ReviewVote extends Model<
  InferAttributes<ReviewVote>,
  InferCreationAttributes<ReviewVote, { omit: "id" | "created_at" }>
> {
  declare id:         CreationOptional<number>;
  declare review_id:  string;
  declare user_id:    number;
  declare created_at: CreationOptional<Date>;
}

ReviewVote.init(
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
    created_at: {
      type:         DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "review_votes",
    timestamps: false,
    indexes: [
      { fields: ["review_id"] },
      { fields: ["user_id"] },
      { unique: true, fields: ["review_id", "user_id"] },
    ],
  }
);

export default ReviewVote;
