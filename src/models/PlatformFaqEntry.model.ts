import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class PlatformFaqEntry extends Model<
  InferAttributes<PlatformFaqEntry>,
  InferCreationAttributes<
    PlatformFaqEntry,
    { omit: "id" | "created_at" | "updated_at" }
  >
> {
  declare id: CreationOptional<string>;
  declare key: string;
  declare triggers: string[];
  declare answer: string;
  declare category: string | null;
  declare is_active: boolean;
  /** Higher priority entries are matched first within the same match_type tier. */
  declare priority: number;
  /** Matching strategy: "exact" | "token" | "includes" */
  declare match_type: "exact" | "token" | "includes";
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

PlatformFaqEntry.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    triggers: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    match_type: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "includes",
      validate: {
        isIn: [["exact", "token", "includes"]],
      },
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
    tableName: "platform_faq_entries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["key"], unique: true, name: "uq_platform_faq_key" },
      { fields: ["is_active"], name: "idx_platform_faq_active" },
      { fields: ["category"], name: "idx_platform_faq_category" },
      { fields: ["is_active", "priority"], name: "idx_platform_faq_active_priority" },
    ],
  }
);

export default PlatformFaqEntry;
