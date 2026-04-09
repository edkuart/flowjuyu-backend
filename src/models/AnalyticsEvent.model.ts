import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class AnalyticsEvent extends Model<
  InferAttributes<AnalyticsEvent>,
  InferCreationAttributes<AnalyticsEvent, { omit: "id" | "created_at" }>
> {
  declare id: CreationOptional<number>;
  declare event_name: string;
  declare seller_id: number | null;
  declare payload: Record<string, unknown> | null;
  declare created_at: CreationOptional<Date>;
}

AnalyticsEvent.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    event_name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "analytics_events",
    timestamps: false,
    indexes: [
      { fields: ["event_name"] },
      { fields: ["created_at"] },
      { fields: ["seller_id"] },
    ],
  }
);

export default AnalyticsEvent;
