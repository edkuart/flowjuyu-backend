import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

export type MarketingPromptStatus = "shown" | "accepted" | "dismissed" | "snoozed";

class UserMarketingPromptState extends Model<
  InferAttributes<UserMarketingPromptState>,
  InferCreationAttributes<UserMarketingPromptState, { omit: "id" | "created_at" | "updated_at" }>
> {
  declare id: CreationOptional<number>;
  declare user_id: number;
  declare prompt_key: string;
  declare status: MarketingPromptStatus;
  declare shown_at: Date | null;
  declare acted_at: Date | null;
  declare metadata: Record<string, unknown> | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

UserMarketingPromptState.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    prompt_key: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    shown_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    acted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: "user_marketing_prompt_states",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { unique: true, fields: ["user_id", "prompt_key"] },
      { fields: ["prompt_key"] },
      { fields: ["status"] },
    ],
  },
);

export default UserMarketingPromptState;
